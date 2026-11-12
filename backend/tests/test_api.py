from datetime import datetime, timezone
from io import BytesIO
import json
import re

from flask import redirect
from openpyxl import Workbook

import app as app_module
from app import (
    AccountSettings,
    Favorite,
    PasswordResetVerification,
    ProductCertification,
    ProducerProduct,
    ProductListing,
    QuotationMessage,
    QuotationOffer,
    QuotationRecord,
    ReadNotification,
    SipsaPriceReference,
    SettingsVerification,
    User,
    app as flask_app,
    _apply_product_fields,
    _get_database_url,
    _migrate_normalized_tables,
    _migrate_user_columns,
    _product_payload,
    db,
    google,
    socketio,
)
from sqlalchemy import inspect, text


def test_database_url_defaults_to_local_sqlite_when_unset_or_blank(monkeypatch):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert _get_database_url() == "sqlite:///agrocordoba.db"

    monkeypatch.setenv("DATABASE_URL", " ")
    assert _get_database_url() == "sqlite:///agrocordoba.db"


def test_database_url_uses_installed_psycopg2_driver(monkeypatch):
    monkeypatch.setenv(
        "DATABASE_URL", "postgresql://user:pass@db.example.com:5432/agrocordoba"
    )
    assert _get_database_url() == (
        "postgresql+psycopg2://user:pass@db.example.com:5432/agrocordoba"
    )

    monkeypatch.setenv(
        "DATABASE_URL", "postgres://user:pass@db.example.com:5432/agrocordoba"
    )
    assert _get_database_url() == (
        "postgresql+psycopg2://user:pass@db.example.com:5432/agrocordoba"
    )

    explicit = "postgresql+psycopg2://user:pass@db.example.com:5432/agrocordoba"
    monkeypatch.setenv("DATABASE_URL", explicit)
    assert _get_database_url() == explicit


def test_frontend_index_uses_request_origin_for_canonical(client, tmp_path, monkeypatch):
    (tmp_path / "index.html").write_text(
        '<link rel="canonical" href="https://agrocordoba.onrender.com/" />',
        encoding="utf-8",
    )
    monkeypatch.setenv("FRONTEND_DIST_DIR", str(tmp_path))

    response = client.get("/")

    assert response.status_code == 200
    assert b'href="http://localhost/"' in response.data


def test_robots_uses_request_origin_for_sitemap(client):
    response = client.get("/robots.txt")

    assert response.status_code == 200
    assert "Sitemap: http://localhost/sitemap.xml" in response.get_data(as_text=True)


def create_user(**overrides):
    values = {
        "google_sub": "google-user-123",
        "email": "campesino@example.com",
        "name": "María Pérez",
        "avatar": "https://example.com/avatar.png",
        "registered_at": datetime(2026, 1, 2, tzinfo=timezone.utc),
    }
    values.update(overrides)
    user = User(**values)
    db.session.add(user)
    db.session.commit()
    return user


def test_health_reports_ok(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}


def test_me_requires_a_session(client):
    response = client.get("/api/auth/me")

    assert response.status_code == 401
    assert response.get_json() == {"error": "No hay una sesión iniciada."}


def test_me_returns_public_user_data(client):
    user = create_user()
    with client.session_transaction() as session:
        session["user_id"] = user.id

    response = client.get("/api/auth/me")

    assert response.status_code == 200
    payload = response.get_json()["user"]
    assert payload["id"] == user.id
    assert payload["name"] == "María Pérez"
    assert payload["email"] == "campesino@example.com"
    assert payload["role"] == "cliente"
    assert payload["city"] == "Montería"
    assert payload["status"] == "activo"
    assert "google_sub" not in payload


def test_farm_address_is_returned_only_in_the_owner_account_payload(client):
    producer = create_user(
        google_sub="private-farm-address",
        email="private-farm-address@example.com",
        role="productor",
        farm_address="Finca privada, vía Montería",
    )

    assert "farmAddress" not in producer.to_public_dict()
    login_as(client, producer)
    response = client.get("/api/auth/me")

    assert response.status_code == 200
    assert response.get_json()["user"]["farmAddress"] == "Finca privada, vía Montería"


def test_me_clears_a_session_for_a_missing_user(client):
    with client.session_transaction() as session:
        session["user_id"] = "missing-user-id"

    response = client.get("/api/auth/me")

    assert response.status_code == 401
    with client.session_transaction() as session:
        assert "user_id" not in session


def test_local_registration_returns_the_created_user(client):
    response = client.post(
        "/api/auth/register",
        json={
            "name": "Compradora de prueba",
            "email": "compradora@example.com",
            "password": "StrongPass123",
            "gender": "femenino",
            "phone": "3001234567",
            "city": "Montería",
            "role": "cliente",
        },
    )

    assert response.status_code == 201
    assert response.is_json
    assert response.get_json()["user"]["email"] == "compradora@example.com"
    assert response.get_json()["user"]["role"] == "cliente"
    assert User.query.filter_by(email="compradora@example.com").first() is not None


def test_producer_registration_stores_products_as_rows(client):
    response = client.post(
        "/api/auth/register",
        json={
            "name": "Productora de prueba",
            "email": "productora@example.com",
            "password": "StrongPass123",
            "gender": "femenino",
            "phone": "3001234567",
            "city": "Montería",
            "role": "productor",
            "farmName": "Finca de prueba",
            "association": "Asociación de prueba",
            "products": ["Yuca", "Ñame", "Yuca"],
        },
    )

    assert response.status_code == 201
    user = User.query.filter_by(email="productora@example.com").first()
    assert user is not None
    assert response.get_json()["user"]["products"] == ["Yuca", "Ñame"]
    assert [item.name for item in ProducerProduct.query.filter_by(user_id=user.id).order_by(ProducerProduct.id)] == [
        "Yuca",
        "Ñame",
    ]


def test_local_registration_rejects_duplicate_email_with_json(client):
    create_user()

    response = client.post(
        "/api/auth/register",
        json={
            "name": "Otro usuario",
            "email": "campesino@example.com",
            "password": "StrongPass123",
            "gender": "masculino",
            "phone": "3001234567",
            "city": "Montería",
            "role": "cliente",
        },
    )

    assert response.status_code == 409
    assert response.is_json
    assert "Ya existe" in response.get_json()["error"]


def test_logout_clears_the_session(client):
    with client.session_transaction() as session:
        session["user_id"] = "some-user-id"

    response = client.post("/api/auth/logout")

    assert response.status_code == 200
    assert response.get_json() == {"ok": True}
    with client.session_transaction() as session:
        assert "user_id" not in session


def test_user_email_and_google_subject_must_be_unique(client):
    create_user()
    duplicate_email = User(google_sub="another-sub", email="campesino@example.com", name="Otro")
    db.session.add(duplicate_email)

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
    else:
        raise AssertionError("La base de datos aceptó un correo duplicado")

    duplicate_subject = User(google_sub="google-user-123", email="otro@example.com", name="Otro")
    db.session.add(duplicate_subject)

    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
    else:
        raise AssertionError("La base de datos aceptó un identificador Google duplicado")


def login_as(client, user):
    with client.session_transaction() as session:
        session["user_id"] = user.id


def product_payload(**overrides):
    values = {
        "name": "Yuca",
        "category": "Tubérculos y Raíces",
        "priceCopKg": 2500,
        "priceUsdKg": 0.6,
        "stockAvailableKg": 1000,
        "stockMinKg": 100,
        "minOrderKg": 50,
        "lat": 8.75,
        "lng": -75.88,
        "municipalityId": "monteria",
        "municipalityName": "Montería",
    }
    values.update(overrides)
    return values


def create_listing(producer, payload=None):
    listing = ProductListing(producer_id=producer.id)
    _apply_product_fields(listing, payload or product_payload())
    db.session.add(listing)
    db.session.flush()
    return listing


def create_quotation(client_id, producer_id, product_id="reference-product", **overrides):
    values = {
        "client_id": client_id,
        "producer_id": producer_id,
        "product_id": product_id,
        "product_name": "Yuca",
        "client_name": "Comprador",
    }
    values.update(overrides)
    quotation = QuotationRecord(**values)
    db.session.add(quotation)
    db.session.flush()
    return quotation


def test_quotation_delivery_details_are_hidden_until_agreement_and_can_be_closed(client):
    buyer = create_user(
        google_sub="delivery-buyer",
        email="delivery-buyer@example.com",
        role="cliente",
    )
    producer = create_user(
        google_sub="delivery-producer",
        email="delivery-producer@example.com",
        role="productor",
        status="activo",
    )
    quotation = create_quotation(
        buyer.id,
        producer.id,
        status="Pendiente",
        fulfillment_method="domicilio",
        delivery_address="Calle 10 # 20-30",
        delivery_latitude=8.75,
        delivery_longitude=-75.88,
        payment_method="efectivo",
    )
    db.session.commit()

    login_as(client, buyer)
    pending = client.get("/api/quotations").get_json()["quotations"][0]
    assert "deliveryAddress" not in pending
    assert "deliveryLatitude" not in pending

    quotation.status = "Acordado"
    db.session.commit()
    agreed = client.get("/api/quotations").get_json()["quotations"][0]
    assert agreed["deliveryAddress"] == "Calle 10 # 20-30"
    assert agreed["deliveryLatitude"] == 8.75
    assert agreed["paymentMethod"] == "efectivo"

    producer_client = flask_app.test_client()
    login_as(producer_client, producer)
    delivered = producer_client.patch(
        f"/api/quotations/{quotation.id}",
        json={"status": "Entregado"},
    )
    assert delivered.status_code == 200
    assert delivered.get_json()["quotation"]["status"] == "Entregado"

    closed = client.patch(
        f"/api/quotations/{quotation.id}",
        json={"status": "Cerrado"},
    )
    assert closed.status_code == 200
    assert closed.get_json()["quotation"]["status"] == "Cerrado"


def test_pickup_requires_private_producer_address_before_ready_status(client):
    buyer = create_user(
        google_sub="pickup-buyer",
        email="pickup-buyer@example.com",
        role="cliente",
    )
    producer = create_user(
        google_sub="pickup-producer",
        email="pickup-producer@example.com",
        role="productor",
        status="activo",
        farm_address="",
    )
    quotation = create_quotation(
        buyer.id,
        producer.id,
        status="Acordado",
        fulfillment_method="recoger",
    )
    db.session.commit()
    login_as(client, producer)

    missing_address = client.patch(
        f"/api/quotations/{quotation.id}",
        json={"status": "Listo para recoger"},
    )
    assert missing_address.status_code == 400
    assert "dirección privada" in missing_address.get_json()["error"]

    producer.farm_address = "Finca El Paraíso, vía Montería"
    db.session.commit()
    ready = client.patch(
        f"/api/quotations/{quotation.id}",
        json={"status": "Listo para recoger"},
    )
    assert ready.status_code == 200
    assert ready.get_json()["quotation"]["producerPickupAddress"] == "Finca El Paraíso, vía Montería"

    buyer_client = flask_app.test_client()
    login_as(buyer_client, buyer)
    closed = buyer_client.patch(
        f"/api/quotations/{quotation.id}",
        json={"status": "Cerrado"},
    )
    assert closed.status_code == 200


def test_domicile_quotation_requires_address_and_complete_coordinates(client):
    buyer = create_user(
        google_sub="delivery-validation-buyer",
        email="delivery-validation-buyer@example.com",
        role="cliente",
    )
    producer = create_user(
        google_sub="delivery-validation-producer",
        email="delivery-validation-producer@example.com",
        role="productor",
        status="activo",
    )
    listing = create_listing(producer)
    login_as(client, buyer)
    payload = {
        "productId": listing.id,
        "quantityKg": 100,
        "destinationZone": "Local Córdoba",
        "freightCop": 0,
        "fulfillmentMethod": "domicilio",
        "paymentMethod": "transferencia",
    }

    missing_address = client.post("/api/quotations", json=payload)
    assert missing_address.status_code == 400

    payload.update({
        "deliveryAddress": "Carrera 1 # 2-3, Montería",
        "deliveryLatitude": 8.75,
    })
    incomplete_coordinates = client.post("/api/quotations", json=payload)
    assert incomplete_coordinates.status_code == 400

    payload["deliveryLongitude"] = -75.88
    created = client.post("/api/quotations", json=payload)
    assert created.status_code == 201
    quotation = created.get_json()["quotation"]
    assert quotation["fulfillmentMethod"] == "domicilio"
    assert quotation["paymentMethod"] == "transferencia"
    assert "deliveryAddress" not in quotation


def test_unread_message_counts_are_per_quotation_and_clear_when_chat_opens(client):
    buyer = create_user(
        google_sub="unread-buyer",
        email="unread-buyer@example.com",
    )
    producer = create_user(
        google_sub="unread-producer",
        email="unread-producer@example.com",
        role="productor",
        status="activo",
    )
    quotation = create_quotation(buyer.id, producer.id)
    db.session.add_all([
        QuotationMessage(
            quotation_id=quotation.id,
            sender_id=producer.id,
            sender_name=producer.name,
            content="¿Cuándo lo necesitas?",
        ),
        QuotationMessage(
            quotation_id=quotation.id,
            sender_id=buyer.id,
            sender_name=buyer.name,
            content="Esta semana.",
        ),
    ])
    db.session.commit()
    login_as(client, buyer)

    counts = client.get("/api/notifications/unread-messages")
    assert counts.status_code == 200
    assert counts.get_json()["counts"] == {quotation.id: 1}

    socket = socketio.test_client(flask_app, flask_test_client=client)
    result = socket.emit("quotation:join", {"quotationId": quotation.id}, callback=True)
    assert result["ok"] is True
    assert client.get("/api/notifications/unread-messages").get_json()["counts"] == {}


def test_product_public_data_uses_local_image_fallbacks_when_missing(client):
    producer = create_user(
        google_sub="producer-without-profile-image",
        email="producer-without-image@example.com",
        role="productor",
        avatar="",
    )
    listing = create_listing(
        producer,
        product_payload(name="Yuca de ejemplo", image=""),
    )

    public_product = listing.to_public_dict()

    assert public_product["image"] == "/images/yuca-real.jpg"
    assert public_product["producerPhoto"] == "/images/campesinos-colombia.jpg"


def test_product_validation_accepts_cordoba_negative_longitude():
    valid, error = _product_payload(product_payload())

    assert error is None
    assert valid["lng"] == -75.88


def test_active_producer_can_publish_product_with_negative_longitude(client):
    producer = create_user(
        google_sub="producer-sub",
        email="producer@example.com",
        role="productor",
        status="activo",
    )
    login_as(client, producer)

    response = client.post(
        "/api/products",
        json=product_payload(certifications=["Orgánica", "Comercio justo"]),
    )

    assert response.status_code == 201
    payload = response.get_json()["product"]
    assert payload["lng"] == -75.88
    assert payload["certifications"] == ["Orgánica", "Comercio justo"]
    assert ProductCertification.query.count() == 2
    assert "data" not in {column["name"] for column in inspect(db.engine).get_columns("product_listing")}


def test_product_page_includes_server_rendered_metadata_and_schema(client, tmp_path, monkeypatch):
    producer = create_user(
        google_sub="seo-producer-sub",
        email="seo-producer@example.com",
        role="productor",
        status="activo",
    )
    listing = create_listing(
        producer,
        product_payload(
            name="Ñame espino",
            description="Ñame fresco de Córdoba.",
            image="/images/name-real.jpg",
            municipalityName="Ciénaga de Oro",
        ),
    )
    db.session.add(listing)
    db.session.commit()
    dist_dir = tmp_path / "dist"
    dist_dir.mkdir()
    (dist_dir / "index.html").write_text(
        '<!doctype html><html><head><title>AgroCórdoba</title>'
        '<meta name="description" content="Inicio" />'
        '<link rel="canonical" href="https://agrocordoba.onrender.com/" />'
        '<meta property="og:url" content="https://agrocordoba.onrender.com/" />'
        '<meta property="og:title" content="Inicio" />'
        '<meta property="og:description" content="Inicio" />'
        '<meta property="og:image" content="" />'
        '</head><body><div id="root"></div></body></html>',
        encoding="utf-8",
    )
    monkeypatch.setenv("FRONTEND_DIST_DIR", str(dist_dir))

    response = client.get(f"/producto/name/{listing.id}")
    html_response = response.get_data(as_text=True)
    schema_match = re.search(
        r'<script[^>]*type="application/ld\+json">(.*?)</script>',
        html_response,
    )

    assert response.status_code == 200
    assert "<title>Ñame espino en Ciénaga de Oro | AgroCórdoba</title>" in html_response
    assert 'rel="canonical" href="http://localhost/producto/name-espino/' in html_response
    assert "<h1>Ñame espino</h1>" in html_response
    assert schema_match is not None
    schema = json.loads(schema_match.group(1))
    assert schema["@type"] == "Product"
    assert schema["offers"]["price"] == 2500
    assert schema["offers"]["priceSpecification"]["unitCode"] == "KGM"


def test_sitemap_lists_active_public_product_pages(client):
    producer = create_user(
        google_sub="sitemap-producer-sub",
        email="sitemap-producer@example.com",
        role="productor",
        status="activo",
    )
    listing = create_listing(producer, product_payload(name="Ñame espino"))
    db.session.commit()

    response = client.get("/sitemap.xml")
    sitemap = response.get_data(as_text=True)

    assert response.status_code == 200
    assert response.mimetype == "application/xml"
    assert f"/producto/name-espino/{listing.id}" in sitemap


def test_admin_can_list_quotes_and_edit_products(client):
    producer = create_user(
        google_sub="producer-for-admin",
        email="producer-admin@example.com",
        role="productor",
        status="activo",
    )
    admin = create_user(
        google_sub="admin-sub",
        email="admin@example.com",
        role="admin",
    )
    listing = create_listing(producer)
    quote = create_quotation(
        client_id=create_user(google_sub="buyer-for-quote", email="buyer-quote@example.com").id,
        producer_id=producer.id,
    )
    db.session.commit()
    login_as(client, admin)

    quotes_response = client.get("/api/quotations")
    edit_response = client.put(
        f"/api/products/{listing.id}",
        json=product_payload(priceCopKg=2700),
    )

    assert quotes_response.status_code == 200
    assert len(quotes_response.get_json()["quotations"]) == 1
    assert edit_response.status_code == 200
    assert edit_response.get_json()["product"]["priceCopKg"] == 2700


def test_admin_product_create_requires_active_producer(client):
    producer = create_user(
        google_sub="active-producer-for-admin-create",
        email="active-admin-product@example.com",
        role="productor",
        status="activo",
    )
    admin = create_user(google_sub="admin-create-sub", email="admin-create@example.com", role="admin")
    login_as(client, admin)

    response = client.post("/api/admin/products", json=product_payload(producerId=producer.id))

    assert response.status_code == 201
    assert response.get_json()["product"]["producerId"] == producer.id


def test_favorites_are_saved_per_buyer(client):
    first = create_user(google_sub="favorite-buyer-1", email="favorite-one@example.com")
    second = create_user(google_sub="favorite-buyer-2", email="favorite-two@example.com")
    login_as(client, first)

    save_response = client.put("/api/favorites", json={"favoriteIds": ["prod-1", "prod-2"]})
    assert save_response.status_code == 200
    assert set(save_response.get_json()["favoriteIds"]) == {"prod-1", "prod-2"}
    assert set(client.get("/api/favorites").get_json()["favoriteIds"]) == {"prod-1", "prod-2"}

    login_as(client, second)
    list_response = client.get("/api/favorites")
    assert list_response.status_code == 200
    assert list_response.get_json()["favoriteIds"] == []


def test_read_notifications_only_include_buyers_own_quotes(client):
    first = create_user(google_sub="notify-buyer-1", email="notify-one@example.com")
    second = create_user(google_sub="notify-buyer-2", email="notify-two@example.com")
    producer = create_user(google_sub="notify-producer", email="notify-producer@example.com", role="productor")
    quote = create_quotation(first.id, producer.id, product_id="prod-1")
    db.session.commit()
    login_as(client, second)

    response = client.put("/api/notifications/read", json={"quotationIds": [quote.id]})

    assert response.status_code == 200
    assert response.get_json()["quotationIds"] == []
    assert ReadNotification.query.count() == 0


def test_quotation_fields_are_relational_and_survive_product_deletion(client):
    producer = create_user(
        google_sub="quote-producer",
        email="quote-producer@example.com",
        role="productor",
        status="activo",
        phone="3001234567",
        association="Asociación de prueba",
    )
    buyer = create_user(
        google_sub="quote-buyer",
        email="quote-buyer@example.com",
        phone="3007654321",
        business_type="Restaurante",
    )
    listing = create_listing(producer)
    db.session.commit()
    login_as(client, buyer)

    response = client.post(
        "/api/quotations",
        json={
            "productId": listing.id,
            "quantityKg": 50,
            "freightCop": 1000,
            "destinationZone": "Local Córdoba",
            "notes": "Entrega de ejemplo",
        },
    )

    assert response.status_code == 201
    quote_data = response.get_json()["quotation"]
    quote = db.session.get(QuotationRecord, quote_data["id"])
    assert quote is not None
    assert quote.product_listing_id == listing.id
    assert quote.total_cop == 126000
    assert quote_data["productId"] == listing.id
    assert quote_data["totalUsd"] == 126000 / 4150
    assert "data" not in {column["name"] for column in inspect(db.engine).get_columns("quotation_record")}

    login_as(client, producer)
    deleted = client.delete(f"/api/products/{listing.id}")

    assert deleted.status_code == 200
    db.session.expire(quote)
    assert quote.product_listing_id is None
    assert client.get("/api/quotations").get_json()["quotations"][0]["productName"] == "Yuca"


def test_price_reference_uses_the_latest_official_dane_sipsa_report(client, monkeypatch):
    rows = [
        {
            "productName": "Yuca",
            "market": "Montería, Mercado del Sur",
            "city": "Montería",
            "meanPriceCop": 2600,
            "date": "2026-10-30",
        },
        {
            "productName": "Yuca",
            "market": "Sincelejo, Nuevo Mercado",
            "city": "Sincelejo",
            "meanPriceCop": 2438,
            "date": "2026-10-30",
        },
    ]
    monkeypatch.setattr(
        app_module,
        "_get_sipsa_price_references",
        lambda product: (rows, "2026-10-30", "https://www.dane.gov.co/files/operaciones/SIPSA/anex-SIPSADiario-30oct2026.xlsx"),
    )

    response = client.get("/api/price-references?product=Yuca%20de%20ejemplo")

    assert response.status_code == 200
    payload = response.get_json()
    assert [item["market"] for item in payload["references"]] == [
        "Montería, Mercado del Sur",
        "Sincelejo, Nuevo Mercado",
    ]
    assert payload["references"][0]["meanPriceCop"] == 2600
    assert payload["reportDate"] == "2026-10-30"
    assert payload["reportUrl"].endswith("anex-SIPSADiario-30oct2026.xlsx")
    assert payload["source"]["unit"] == "COP/kg"
    assert "SIPSA" in payload["source"]["name"]


def test_price_reference_rejects_missing_product(client):
    response = client.get("/api/price-references")

    assert response.status_code == 400
    assert "producto válido" in response.get_json()["error"]


def test_price_reference_reports_upstream_errors(client, monkeypatch):
    def unavailable(*args, **kwargs):
        raise app_module.requests.Timeout("source timeout")

    monkeypatch.setattr(app_module, "_get_sipsa_price_references", unavailable)

    response = client.get("/api/price-references?product=Yuca")

    assert response.status_code == 502
    assert "DANE" in response.get_json()["error"]


def test_price_reference_uses_the_last_saved_report_when_dane_is_unavailable(client, monkeypatch):
    db.session.add(
        SipsaPriceReference(
            product_key="yuca",
            product_name="Yuca",
            market="Montería, Mercado del Sur",
            price_cop_kg=2600,
            report_date=datetime(2026, 10, 30).date(),
            report_url="https://www.dane.gov.co/sipsa-30oct2026.xlsx",
        )
    )
    db.session.commit()

    def unavailable(*args, **kwargs):
        raise app_module.requests.Timeout("source timeout")

    monkeypatch.setattr(app_module, "_get_sipsa_price_references", unavailable)
    response = client.get("/api/price-references?product=Yuca%20de%20ejemplo")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["fallbackToStoredData"] is True
    assert payload["reportDate"] == "2026-10-30"
    assert payload["references"][0]["meanPriceCop"] == 2600


def test_price_reference_batch_persists_and_returns_each_product(client, monkeypatch):
    rows = [
        {
            "productName": "Yuca",
            "market": "Montería, Mercado del Sur",
            "priceCopKg": 2600,
            "date": "2026-10-30",
        },
        {
            "productName": "Mango",
            "market": "Montería, Mercado del Sur",
            "priceCopKg": 5200,
            "date": "2026-10-30",
        },
    ]
    monkeypatch.setattr(
        app_module,
        "_get_latest_sipsa_rows",
        lambda: (
            rows,
            "2026-10-30",
            "https://www.dane.gov.co/sipsa-30oct2026.xlsx",
        ),
    )

    response = client.get(
        "/api/price-references/batch?product=Yuca%20de%20ejemplo&product=Mango"
    )

    assert response.status_code == 200
    payload = response.get_json()["referencesByProduct"]
    assert payload["Yuca de ejemplo"]["references"][0]["meanPriceCop"] == 2600
    assert payload["Mango"]["references"][0]["meanPriceCop"] == 5200
    assert SipsaPriceReference.query.count() == 2


def test_sipsa_reference_lookup_returns_live_metadata_and_persists_rows(client, monkeypatch):
    rows = [
        {
            "productName": "Yuca",
            "market": "Montería, Mercado del Sur",
            "priceCopKg": 2600,
            "date": "2026-10-30",
        }
    ]
    report_url = "https://www.dane.gov.co/sipsa-30oct2026.xlsx"
    monkeypatch.setattr(
        app_module,
        "_get_latest_sipsa_rows",
        lambda: (rows, "2026-10-30", report_url),
    )

    references, report_date, actual_report_url = app_module._get_sipsa_price_references(
        "Yuca de ejemplo"
    )

    assert references[0]["meanPriceCop"] == 2600
    assert report_date == "2026-10-30"
    assert actual_report_url == report_url
    assert SipsaPriceReference.query.count() == 1


def test_scheduled_sipsa_refresh_requires_token_and_upserts_daily_data(client, monkeypatch):
    monkeypatch.setenv("SIPSA_TASK_TOKEN", "test-refresh-token")
    report = [
        {
            "productName": "Yuca",
            "market": "Montería, Mercado del Sur",
            "priceCopKg": 2600,
            "date": "2026-10-30",
        }
    ]
    monkeypatch.setattr(
        app_module,
        "_fetch_latest_sipsa_report",
        lambda: (
            report,
            "2026-10-30",
            "https://www.dane.gov.co/sipsa-30oct2026.xlsx",
        ),
    )

    denied = client.post("/api/tasks/price-references/refresh")
    assert denied.status_code == 403

    headers = {"Authorization": "Bearer test-refresh-token"}
    first = client.post("/api/tasks/price-references/refresh", headers=headers)
    assert first.status_code == 200
    assert first.get_json()["storedRows"] == 1

    report[0]["priceCopKg"] = 2750
    second = client.post("/api/tasks/price-references/refresh", headers=headers)

    assert second.status_code == 200
    assert SipsaPriceReference.query.count() == 1
    assert SipsaPriceReference.query.one().price_cop_kg == 2750


def test_sipsa_date_parser_accepts_missing_space_after_de():
    assert app_module._parse_open_data_date(
        "Miércoles 11 denoviembre de 2026"
    ) == datetime(2026, 11, 11)
    assert app_module._parse_open_data_date(
        "Martes 10 de noviembre de 2026"
    ) == datetime(2026, 11, 10)


def test_sipsa_parser_selects_latest_report_and_reads_market_prices(monkeypatch):
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Boletín diario"
    sheet["A2"] = "Precios mayoristas del 30 de octubre de 2026"
    for row, values in {
        3: ["Producto", "Montería, Mercado del Sur", "Variación", "Sincelejo, Nuevo Mercado", "Variación"],
        4: ["", "Precio $/Kg", "Variación %", "Precio $/Kg", "Variación %"],
        5: ["Yuca*", 2600, 1.2, 2438, -0.5],
    }.items():
        for column, value in enumerate(values, start=1):
            sheet.cell(row=row, column=column, value=value)
    content = BytesIO()
    workbook.save(content)
    content.seek(0)

    responses = [
        type("Response", (), {"text": (
            '<a href="/files/operaciones/SIPSA/anex-SIPSADiario-29oct2026.xlsx">'
            '<a href="/files/operaciones/SIPSA/anex-SIPSADiario-30oct2026.xlsx">'
        ), "raise_for_status": lambda self: None})(),
        type("Response", (), {"content": content.getvalue(), "raise_for_status": lambda self: None})(),
    ]
    monkeypatch.setattr(app_module.requests, "get", lambda *args, **kwargs: responses.pop(0))

    rows, report_date, report_url = app_module._fetch_latest_sipsa_report()

    assert report_date == "2026-10-30"
    assert report_url.endswith("anex-SIPSADiario-30oct2026.xlsx")
    assert [(row["productName"], row["market"], row["priceCopKg"]) for row in rows] == [
        ("Yuca", "Montería, Mercado del Sur", 2600),
        ("Yuca", "Sincelejo, Nuevo Mercado", 2438),
    ]


def test_quotation_socket_requires_authentication(client):
    socket = socketio.test_client(flask_app, flask_test_client=client)

    assert not socket.is_connected()


def test_quotation_messages_are_realtime_persistent_and_scoped_to_participants(client):
    buyer = create_user(google_sub="chat-buyer", email="chat-buyer@example.com")
    producer = create_user(
        google_sub="chat-producer",
        email="chat-producer@example.com",
        role="productor",
        status="activo",
    )
    quotation = create_quotation(buyer.id, producer.id)
    db.session.commit()

    buyer_http = flask_app.test_client()
    login_as(buyer_http, buyer)
    buyer_socket = socketio.test_client(flask_app, flask_test_client=buyer_http)
    assert buyer_socket.is_connected()
    buyer_join = buyer_socket.emit("quotation:join", {"quotationId": quotation.id}, callback=True)
    assert buyer_join["ok"] is True
    assert buyer_join["messages"] == []

    producer_http = flask_app.test_client()
    login_as(producer_http, producer)
    manual_agreement = producer_http.patch(
        f"/api/quotations/{quotation.id}",
        json={"status": "Acordado"},
    )
    assert manual_agreement.status_code == 400
    producer_socket = socketio.test_client(flask_app, flask_test_client=producer_http)
    assert producer_socket.is_connected()
    producer_join = producer_socket.emit("quotation:join", {"quotationId": quotation.id}, callback=True)
    assert producer_join["ok"] is True

    sent = buyer_socket.emit(
        "quotation:send",
        {"quotationId": quotation.id, "content": "¿Podemos acordar la entrega para el viernes?"},
        callback=True,
    )
    assert sent["ok"] is True
    assert sent["message"]["senderId"] == buyer.id
    assert any(
        event["name"] == "quotation:message" and event["args"][0]["content"] == sent["message"]["content"]
        for event in producer_socket.get_received()
    )
    assert QuotationMessage.query.filter_by(quotation_id=quotation.id).count() == 1

    buyer_socket.disconnect()
    producer_socket.disconnect()


def test_quotation_socket_presence_typing_and_read_receipts(client):
    buyer = create_user(google_sub="presence-buyer", email="presence-buyer@example.com")
    producer = create_user(
        google_sub="presence-producer",
        email="presence-producer@example.com",
        role="productor",
        status="activo",
    )
    outsider = create_user(google_sub="presence-outsider", email="presence-outsider@example.com")
    quotation = create_quotation(buyer.id, producer.id)
    db.session.commit()

    buyer_http = flask_app.test_client()
    login_as(buyer_http, buyer)
    buyer_socket = socketio.test_client(flask_app, flask_test_client=buyer_http)
    buyer_join = buyer_socket.emit("quotation:join", {"quotationId": quotation.id}, callback=True)
    assert buyer_join["ok"] is True
    assert buyer_join["participantOnline"] is False

    sent = buyer_socket.emit(
        "quotation:send",
        {"quotationId": quotation.id, "content": "Quedo atento a la disponibilidad."},
        callback=True,
    )
    assert sent["ok"] is True
    assert sent["message"]["readAt"] is None

    producer_http = flask_app.test_client()
    login_as(producer_http, producer)
    producer_socket = socketio.test_client(flask_app, flask_test_client=producer_http)
    producer_join = producer_socket.emit("quotation:join", {"quotationId": quotation.id}, callback=True)
    assert producer_join["ok"] is True
    assert producer_join["participantOnline"] is True
    assert producer_join["messages"][0]["readAt"] is not None
    assert any(
        event["name"] == "quotation:read"
        and sent["message"]["id"] in event["args"][0]["messageIds"]
        for event in buyer_socket.get_received()
    )

    read_on_delivery = producer_socket.emit(
        "quotation:send",
        {"quotationId": quotation.id, "content": "Sí, hay disponibilidad para el viernes."},
        callback=True,
    )
    assert read_on_delivery["ok"] is True
    assert read_on_delivery["message"]["readAt"] is not None

    typing = buyer_socket.emit(
        "quotation:typing",
        {"quotationId": quotation.id, "typing": True},
        callback=True,
    )
    assert typing["ok"] is True
    assert any(
        event["name"] == "quotation:typing"
        and event["args"][0] == {"userId": buyer.id, "typing": True}
        for event in producer_socket.get_received()
    )

    outsider_http = flask_app.test_client()
    login_as(outsider_http, outsider)
    outsider_socket = socketio.test_client(flask_app, flask_test_client=outsider_http)
    denied_typing = outsider_socket.emit(
        "quotation:typing",
        {"quotationId": quotation.id, "typing": True},
        callback=True,
    )
    assert denied_typing["ok"] is False

    producer_socket.disconnect()
    assert any(
        event["name"] == "quotation:presence"
        and event["args"][0] == {"userId": producer.id, "online": False}
        for event in buyer_socket.get_received()
    )

    outsider_socket.disconnect()
    buyer_socket.disconnect()


def test_quotation_socket_denies_nonparticipants_and_invalid_messages(client):
    buyer = create_user(google_sub="chat-owner", email="chat-owner@example.com")
    producer = create_user(
        google_sub="chat-owner-producer",
        email="chat-owner-producer@example.com",
        role="productor",
        status="activo",
    )
    other_buyer = create_user(google_sub="chat-other", email="chat-other@example.com")
    quotation = create_quotation(buyer.id, producer.id)
    db.session.commit()

    other_http = flask_app.test_client()
    login_as(other_http, other_buyer)
    other_socket = socketio.test_client(flask_app, flask_test_client=other_http)
    denied_join = other_socket.emit("quotation:join", {"quotationId": quotation.id}, callback=True)
    denied_send = other_socket.emit(
        "quotation:send",
        {"quotationId": quotation.id, "content": "No autorizado"},
        callback=True,
    )
    assert denied_join["ok"] is False
    assert denied_send["ok"] is False

    buyer_http = flask_app.test_client()
    login_as(buyer_http, buyer)
    buyer_socket = socketio.test_client(flask_app, flask_test_client=buyer_http)
    invalid_send = buyer_socket.emit(
        "quotation:send",
        {"quotationId": quotation.id, "content": " "},
        callback=True,
    )
    assert invalid_send["ok"] is False
    assert QuotationMessage.query.count() == 0

    other_socket.disconnect()
    buyer_socket.disconnect()


def test_quotation_offers_are_structured_counteroffers_and_update_quote_state(client, monkeypatch):
    buyer = create_user(google_sub="offer-buyer", email="offer-buyer@example.com")
    producer = create_user(
        google_sub="offer-producer",
        email="offer-producer@example.com",
        role="productor",
        status="activo",
    )
    quotation = create_quotation(buyer.id, producer.id)
    db.session.commit()
    price_reference = {
        "productName": "Yuca",
        "market": "Montería, Mercado del Sur",
        "city": "Montería",
        "meanPriceCop": 2600,
        "date": "2026-10-30",
    }
    monkeypatch.setattr(
        app_module,
        "_official_price_snapshot",
        lambda product: (
            price_reference,
            "2026-10-30",
            "https://www.dane.gov.co/files/operaciones/SIPSA/anex-SIPSADiario-30oct2026.xlsx",
        ),
    )

    buyer_http = flask_app.test_client()
    login_as(buyer_http, buyer)
    buyer_socket = socketio.test_client(flask_app, flask_test_client=buyer_http)
    assert buyer_socket.emit("quotation:join", {"quotationId": quotation.id}, callback=True)["ok"]

    producer_http = flask_app.test_client()
    login_as(producer_http, producer)
    producer_socket = socketio.test_client(flask_app, flask_test_client=producer_http)
    assert producer_socket.emit("quotation:join", {"quotationId": quotation.id}, callback=True)["ok"]

    producer_offer = producer_socket.emit(
        "quotation:offer",
        {"quotationId": quotation.id, "unitPriceCop": 2800, "quantityKg": 50, "freightCop": 5000},
        callback=True,
    )
    assert producer_offer["ok"] is True
    assert producer_offer["quotation"]["status"] == "Cotizado"
    assert producer_offer["message"]["messageType"] == "offer"
    assert producer_offer["message"]["offer"]["totalCop"] == 145000
    assert producer_offer["message"]["offer"]["priceReference"]["market"] == "Montería, Mercado del Sur"
    assert producer_offer["message"]["offer"]["priceReference"]["priceCopKg"] == 2600

    duplicate_offer = producer_socket.emit(
        "quotation:offer",
        {"quotationId": quotation.id, "unitPriceCop": 2850, "quantityKg": 50, "freightCop": 5000},
        callback=True,
    )
    assert duplicate_offer["ok"] is False

    counteroffer = buyer_socket.emit(
        "quotation:offer",
        {"quotationId": quotation.id, "unitPriceCop": 2700, "quantityKg": 60, "freightCop": 0},
        callback=True,
    )
    assert counteroffer["ok"] is True
    assert counteroffer["quotation"]["status"] == "En negociación"
    first_offer = db.session.get(QuotationOffer, producer_offer["message"]["offer"]["id"])
    second_offer = db.session.get(QuotationOffer, counteroffer["message"]["offer"]["id"])
    assert first_offer.status == "Contraofertada"
    assert second_offer.status == "Pendiente"
    assert any(
        event["name"] == "quotation:offer:updated"
        and event["args"][0]["offer"]["status"] == "Contraofertada"
        for event in buyer_socket.get_received()
    )

    competing_offer = QuotationOffer(
        quotation_id=quotation.id,
        sender_id=producer.id,
        sender_name=producer.name,
        unit_price_cop=3000,
        quantity_kg=40,
        freight_cop=1000,
        total_cop=121000,
        reference_product="Yuca",
        reference_price_cop_kg=2600,
        reference_market="Montería, Mercado del Sur",
        reference_date="2026-10-30",
        reference_source_url="https://www.dane.gov.co",
    )
    db.session.add(competing_offer)
    db.session.flush()
    db.session.add(
        QuotationMessage(
            quotation_id=quotation.id,
            sender_id=producer.id,
            sender_name=producer.name,
            content="Oferta alternativa",
            message_type="offer",
            offer_id=competing_offer.id,
        )
    )
    db.session.commit()

    accepted = producer_socket.emit(
        "quotation:offer:respond",
        {"offerId": second_offer.id, "action": "accept"},
        callback=True,
    )
    assert accepted["ok"] is True
    assert accepted["offer"]["status"] == "Aceptada"
    assert accepted["quotation"]["status"] == "Acordado"
    agreed_quotation = db.session.get(QuotationRecord, quotation.id)
    assert agreed_quotation.status == "Acordado"
    assert agreed_quotation.quantity_kg == 60
    assert agreed_quotation.subtotal_cop == 162000
    assert agreed_quotation.freight_cop == 0
    assert agreed_quotation.total_cop == 162000
    assert db.session.get(QuotationOffer, competing_offer.id).status == "Anulada"
    assert any(
        event["name"] == "quotation:offer:updated"
        for event in buyer_socket.get_received()
    )

    buyer_socket.disconnect()
    producer_socket.disconnect()


def test_quotation_socket_reconnect_reloads_persisted_messages_without_duplicates(client):
    buyer = create_user(
        google_sub="reconnect-buyer",
        email="reconnect-buyer@example.com",
    )
    producer = create_user(
        google_sub="reconnect-producer",
        email="reconnect-producer@example.com",
        role="productor",
    )
    quotation = create_quotation(buyer.id, producer.id)

    first_http = flask_app.test_client()
    login_as(first_http, buyer)
    first_socket = socketio.test_client(flask_app, flask_test_client=first_http)
    assert first_socket.emit("quotation:join", {"quotationId": quotation.id}, callback=True)["ok"]
    sent = first_socket.emit(
        "quotation:send",
        {"quotationId": quotation.id, "content": "Mensaje antes de reconectar."},
        callback=True,
    )
    assert sent["ok"] is True
    first_socket.disconnect()

    second_http = flask_app.test_client()
    login_as(second_http, buyer)
    second_socket = socketio.test_client(flask_app, flask_test_client=second_http)
    rejoined = second_socket.emit("quotation:join", {"quotationId": quotation.id}, callback=True)

    assert rejoined["ok"] is True
    assert [message["id"] for message in rejoined["messages"]] == [sent["message"]["id"]]
    assert QuotationMessage.query.filter_by(quotation_id=quotation.id).count() == 1
    second_socket.disconnect()


def test_quotation_offer_can_be_sent_without_official_reference(client, monkeypatch):
    buyer = create_user(google_sub="offer-check-buyer", email="offer-check-buyer@example.com")
    producer = create_user(
        google_sub="offer-check-producer",
        email="offer-check-producer@example.com",
        role="productor",
        status="activo",
    )
    quotation = create_quotation(buyer.id, producer.id)
    db.session.commit()
    buyer_http = flask_app.test_client()
    login_as(buyer_http, buyer)
    buyer_socket = socketio.test_client(flask_app, flask_test_client=buyer_http)
    buyer_socket.emit("quotation:join", {"quotationId": quotation.id}, callback=True)

    monkeypatch.setattr(app_module, "_official_price_snapshot", lambda product: (None, "2026-10-30", ""))
    no_reference = buyer_socket.emit(
        "quotation:offer",
        {"quotationId": quotation.id, "unitPriceCop": 2500, "quantityKg": 50, "freightCop": 0},
        callback=True,
    )
    assert no_reference["ok"] is True
    assert no_reference["message"]["offer"]["priceReference"] is None
    assert "no tiene un precio comparable" in no_reference["message"]["offer"]["priceReferenceUnavailable"]["reason"]
    assert no_reference["message"]["offer"]["priceReferenceUnavailable"]["date"] == "2026-10-30"
    assert QuotationOffer.query.count() == 1
    saved_offer = QuotationOffer.query.one()
    assert saved_offer.reference_price_cop_kg == 0
    assert saved_offer.reference_source_url == app_module.DANE_SIPSA_PAGE_URL

    monkeypatch.setattr(
        app_module,
        "_official_price_snapshot",
        lambda product: (
            {
                "productName": "Yuca",
                "market": "Montería, Mercado del Sur",
                "meanPriceCop": 2600,
                "date": "2026-10-30",
            },
            "2026-10-30",
            "https://www.dane.gov.co/sipsa.xlsx",
        ),
    )
    producer_http = flask_app.test_client()
    login_as(producer_http, producer)
    producer_socket = socketio.test_client(flask_app, flask_test_client=producer_http)
    assert producer_socket.emit("quotation:join", {"quotationId": quotation.id}, callback=True)["ok"]
    rejected = producer_socket.emit(
        "quotation:offer:respond",
        {"offerId": saved_offer.id, "action": "reject"},
        callback=True,
    )
    assert rejected["ok"] is True

    invalid = buyer_socket.emit(
        "quotation:offer",
        {"quotationId": quotation.id, "unitPriceCop": -1, "quantityKg": 50, "freightCop": 0},
        callback=True,
    )
    assert invalid["ok"] is False
    assert QuotationOffer.query.count() == 1
    buyer_socket.disconnect()
    producer_socket.disconnect()


def test_quotation_offer_can_be_sent_when_official_source_is_unavailable(client, monkeypatch):
    buyer = create_user(google_sub="offer-source-down-buyer", email="offer-source-down-buyer@example.com")
    producer = create_user(
        google_sub="offer-source-down-producer",
        email="offer-source-down-producer@example.com",
        role="productor",
        status="activo",
    )
    quotation = create_quotation(buyer.id, producer.id)
    db.session.commit()
    buyer_http = flask_app.test_client()
    login_as(buyer_http, buyer)
    buyer_socket = socketio.test_client(flask_app, flask_test_client=buyer_http)
    assert buyer_socket.emit("quotation:join", {"quotationId": quotation.id}, callback=True)["ok"]

    def unavailable(product):
        raise app_module.requests.Timeout("source timeout")

    monkeypatch.setattr(app_module, "_official_price_snapshot", unavailable)
    sent = buyer_socket.emit(
        "quotation:offer",
        {"quotationId": quotation.id, "unitPriceCop": 2500, "quantityKg": 50, "freightCop": 0},
        callback=True,
    )

    assert sent["ok"] is True
    assert sent["message"]["offer"]["priceReference"] is None
    assert "No se pudo consultar" in sent["message"]["offer"]["priceReferenceUnavailable"]["reason"]
    assert sent["message"]["offer"]["priceReferenceUnavailable"]["sourceUrl"] == app_module.DANE_SIPSA_PAGE_URL
    assert QuotationOffer.query.count() == 1
    buyer_socket.disconnect()


def test_admin_account_deletion_removes_associated_quotation_messages(client):
    buyer = create_user(google_sub="chat-delete-buyer", email="chat-delete-buyer@example.com")
    producer = create_user(
        google_sub="chat-delete-producer",
        email="chat-delete-producer@example.com",
        role="productor",
        status="activo",
    )
    admin = create_user(
        google_sub="chat-delete-admin",
        email="chat-delete-admin@example.com",
        role="admin",
    )
    quotation = create_quotation(buyer.id, producer.id)
    offer = QuotationOffer(
        quotation_id=quotation.id,
        sender_id=producer.id,
        sender_name=producer.name,
        unit_price_cop=2500,
        quantity_kg=10,
        freight_cop=0,
        total_cop=25000,
        reference_product="Yuca",
        reference_price_cop_kg=2600,
        reference_market="Montería, Mercado del Sur",
        reference_date="2026-10-30",
        reference_source_url="https://www.dane.gov.co/sipsa.xlsx",
    )
    db.session.add(offer)
    db.session.flush()
    db.session.add(
        QuotationMessage(
            quotation_id=quotation.id,
            sender_id=buyer.id,
            sender_name=buyer.name,
            content="Mensaje de prueba",
            message_type="offer",
            offer_id=offer.id,
        )
    )
    db.session.commit()
    quotation_id = quotation.id
    login_as(client, admin)

    response = client.delete(f"/api/admin/users/{buyer.id}")

    assert response.status_code == 200
    assert QuotationRecord.query.filter_by(id=quotation_id).first() is None
    assert QuotationMessage.query.count() == 0
    assert QuotationOffer.query.count() == 0


def test_user_can_delete_own_account_and_related_data(client):
    from werkzeug.security import generate_password_hash

    producer = create_user(
        google_sub="producer-for-account-deletion",
        email="producer-for-deletion@example.com",
        role="productor",
    )
    buyer = create_user(
        google_sub="local:buyer-for-account-deletion",
        email="buyer-for-deletion@example.com",
        role="cliente",
        password_hash=generate_password_hash("current-password"),
    )
    listing = create_listing(producer)
    listing.certifications.append(ProductCertification(name="Certificación de prueba"))
    quotation = create_quotation(
        buyer.id,
        producer.id,
        listing.id,
        product_listing_id=listing.id,
        status="Acordado",
    )
    offer = QuotationOffer(
        quotation_id=quotation.id,
        sender_id=producer.id,
        sender_name=producer.name,
        unit_price_cop=2500,
        quantity_kg=10,
        freight_cop=0,
        total_cop=25000,
        reference_product="Yuca",
        reference_price_cop_kg=2600,
        reference_market="Montería",
        reference_date="2026-10-30",
        reference_source_url="https://www.dane.gov.co/sipsa.xlsx",
    )
    db.session.add_all([
        offer,
        Favorite(user_id=buyer.id, product_id=listing.id),
        ReadNotification(user_id=buyer.id, quotation_id=quotation.id),
        AccountSettings(user_id=buyer.id),
        SettingsVerification(
            user_id=buyer.id,
            code_hash="verification-hash",
            expires_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
            sent_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        ),
        PasswordResetVerification(
            user_id=buyer.id,
            code_hash="reset-hash",
            expires_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
            sent_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        ),
    ])
    db.session.flush()
    db.session.add(
        QuotationMessage(
            quotation_id=quotation.id,
            sender_id=buyer.id,
            sender_name=buyer.name,
            content="Mensaje de prueba",
            message_type="offer",
            offer_id=offer.id,
        )
    )
    db.session.commit()
    quotation_id = quotation.id
    buyer_id = buyer.id
    login_as(client, buyer)

    invalid_email = client.delete(
        "/api/account",
        json={
            "email": "other@example.com",
            "confirmation": "ELIMINAR MI CUENTA",
            "currentPassword": "current-password",
        },
    )
    assert invalid_email.status_code == 400

    invalid_confirmation = client.delete(
        "/api/account",
        json={
            "email": buyer.email,
            "confirmation": "ELIMINAR",
            "currentPassword": "current-password",
        },
    )
    assert invalid_confirmation.status_code == 400

    invalid_password = client.delete(
        "/api/account",
        json={
            "email": buyer.email,
            "confirmation": "ELIMINAR MI CUENTA",
            "currentPassword": "incorrect-password",
        },
    )
    assert invalid_password.status_code == 400
    assert User.query.filter_by(id=buyer_id).first() is not None
    assert QuotationRecord.query.filter_by(id=quotation_id).first() is not None

    response = client.delete(
        "/api/account",
        json={
            "email": buyer.email,
            "confirmation": "ELIMINAR MI CUENTA",
            "currentPassword": "current-password",
        },
    )

    assert response.status_code == 200
    assert response.get_json() == {"ok": True}
    assert User.query.filter_by(id=buyer_id).first() is None
    assert QuotationRecord.query.filter_by(id=quotation_id).first() is None
    assert QuotationOffer.query.filter_by(quotation_id=quotation_id).first() is None
    assert QuotationMessage.query.filter_by(quotation_id=quotation_id).first() is None
    assert Favorite.query.filter_by(user_id=buyer_id).first() is None
    assert ReadNotification.query.filter_by(user_id=buyer_id).first() is None
    assert AccountSettings.query.filter_by(user_id=buyer_id).first() is None
    assert SettingsVerification.query.filter_by(user_id=buyer_id).first() is None
    assert PasswordResetVerification.query.filter_by(user_id=buyer_id).first() is None


def test_google_user_can_delete_own_account_after_explicit_confirmation(client):
    user = create_user(
        google_sub="google-account-for-deletion",
        email="google-user-for-deletion@example.com",
        role="cliente",
        password_hash=None,
    )
    login_as(client, user)

    response = client.delete(
        "/api/account",
        json={"email": user.email, "confirmation": "ELIMINAR MI CUENTA"},
    )

    assert response.status_code == 200
    assert User.query.filter_by(id=user.id).first() is None
    assert client.get("/api/auth/me").status_code == 401


def test_producer_can_delete_own_account_and_listings(client):
    from werkzeug.security import generate_password_hash

    producer = create_user(
        google_sub="local:producer-for-account-deletion",
        email="producer-own-deletion@example.com",
        role="productor",
        password_hash=generate_password_hash("producer-password"),
    )
    buyer = create_user(
        google_sub="buyer-for-producer-deletion",
        email="buyer-for-producer-deletion@example.com",
    )
    listing = create_listing(producer)
    listing.certifications.append(ProductCertification(name="Certificación de prueba"))
    quotation = create_quotation(
        buyer.id,
        producer.id,
        listing.id,
        product_listing_id=listing.id,
    )
    db.session.add(ProducerProduct(user_id=producer.id, name="Yuca"))
    db.session.commit()
    producer_id = producer.id
    listing_id = listing.id
    quotation_id = quotation.id
    login_as(client, producer)

    response = client.delete(
        "/api/account",
        json={
            "email": producer.email,
            "confirmation": "ELIMINAR MI CUENTA",
            "currentPassword": "producer-password",
        },
    )

    assert response.status_code == 200
    assert User.query.filter_by(id=producer_id).first() is None
    assert User.query.filter_by(id=buyer.id).first() is not None
    assert ProductListing.query.filter_by(id=listing_id).first() is None
    assert ProductCertification.query.filter_by(product_id=listing_id).first() is None
    assert ProducerProduct.query.filter_by(user_id=producer_id).first() is None
    assert QuotationRecord.query.filter_by(id=quotation_id).first() is None


def test_admin_cannot_delete_account_through_self_service_endpoint(client):
    from werkzeug.security import generate_password_hash

    admin = create_user(
        google_sub="local:admin-account-deletion",
        email="admin-account-deletion@example.com",
        role="admin",
        password_hash=generate_password_hash("admin-password"),
    )
    login_as(client, admin)

    response = client.delete(
        "/api/account",
        json={
            "email": admin.email,
            "confirmation": "ELIMINAR MI CUENTA",
            "currentPassword": "admin-password",
        },
    )

    assert response.status_code == 403
    assert User.query.filter_by(id=admin.id).first() is not None


def test_account_deletion_requires_authentication(client):
    response = client.delete("/api/account", json={})

    assert response.status_code == 401


def test_legacy_json_columns_are_migrated_without_losing_values(client):
    producer = create_user(
        google_sub="legacy-producer",
        email="legacy-producer@example.com",
        role="productor",
    )
    buyer = create_user(
        google_sub="legacy-buyer",
        email="legacy-buyer@example.com",
    )
    listing = create_listing(producer)
    quote = create_quotation(buyer.id, producer.id, listing.id)
    challenge = SettingsVerification(
        user_id=buyer.id,
        code_hash="legacy-hash",
        expires_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
        sent_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
    )
    settings = AccountSettings(user_id=buyer.id)
    db.session.add_all([challenge, settings])
    db.session.commit()

    for statement in (
        'ALTER TABLE "user" ADD COLUMN producer_products JSON',
        "ALTER TABLE product_listing ADD COLUMN data JSON",
        "ALTER TABLE quotation_record ADD COLUMN data JSON",
        "ALTER TABLE settings_verification ADD COLUMN pending_changes JSON",
        "ALTER TABLE account_settings ADD COLUMN phone VARCHAR(30) NOT NULL DEFAULT ''",
    ):
        db.session.execute(text(statement))
    db.session.execute(
        text('UPDATE "user" SET producer_products = :products WHERE id = :id'),
        {"products": '["Yuca", "Ñame"]', "id": producer.id},
    )
    db.session.execute(
        text("UPDATE product_listing SET data = :data WHERE id = :id"),
        {
            "data": json.dumps(product_payload(name="Yuca migrada", certifications=["Orgánica"])),
            "id": listing.id,
        },
    )
    db.session.execute(
        text("UPDATE quotation_record SET data = :data WHERE id = :id"),
        {
            "data": json.dumps({"productName": "Yuca migrada", "clientName": "Cliente anterior", "totalCop": 5000}),
            "id": quote.id,
        },
    )
    db.session.execute(
        text("UPDATE settings_verification SET pending_changes = :changes WHERE id = :id"),
        {
            "changes": json.dumps(
                {
                    "name": "Nombre migrado",
                    "notifications": {
                        "notificationsEnabled": True,
                        "quoteNotifications": False,
                        "responseNotifications": True,
                    },
                }
            ),
            "id": challenge.id,
        },
    )
    db.session.execute(
        text("UPDATE account_settings SET phone = :phone WHERE user_id = :user_id"),
        {"phone": "3009998877", "user_id": buyer.id},
    )
    db.session.commit()

    _migrate_normalized_tables()
    db.session.expire_all()

    assert [item.name for item in ProducerProduct.query.filter_by(user_id=producer.id).order_by(ProducerProduct.id)] == [
        "Yuca",
        "Ñame",
    ]
    migrated_listing = db.session.get(ProductListing, listing.id)
    assert migrated_listing.name == "Yuca migrada"
    assert [item.name for item in migrated_listing.certifications] == ["Orgánica"]
    migrated_quote = db.session.get(QuotationRecord, quote.id)
    assert migrated_quote.product_name == "Yuca migrada"
    assert migrated_quote.total_cop == 5000
    assert buyer.phone == "3009998877"
    migrated_challenge = SettingsVerification.query.filter_by(user_id=buyer.id).first()
    assert migrated_challenge.pending_name == "Nombre migrado"
    assert migrated_challenge.pending_notifications_enabled is True
    assert migrated_challenge.pending_quote_notifications is False
    assert migrated_challenge.pending_response_notifications is True
    assert all(
        legacy_column not in {
            column["name"] for column in inspect(db.engine).get_columns(table_name)
        }
        for table_name, legacy_column in (
            ("user", "producer_products"),
            ("product_listing", "data"),
            ("quotation_record", "data"),
            ("settings_verification", "pending_changes"),
            ("account_settings", "phone"),
        )
    )


def test_normalized_table_migration_adds_delivery_and_private_address_columns(client):
    for table, column in (
        ("user", "farm_address"),
        ("quotation_record", "fulfillment_method"),
        ("quotation_record", "delivery_address"),
        ("quotation_record", "delivery_latitude"),
        ("quotation_record", "delivery_longitude"),
        ("quotation_record", "payment_method"),
    ):
        db.session.execute(text(f'ALTER TABLE "{table}" DROP COLUMN "{column}"'))
    db.session.commit()

    _migrate_user_columns()
    _migrate_normalized_tables()

    assert "farm_address" in {
        column["name"] for column in inspect(db.engine).get_columns("user")
    }
    quotation_columns = {
        column["name"] for column in inspect(db.engine).get_columns("quotation_record")
    }
    assert {
        "fulfillment_method",
        "delivery_address",
        "delivery_latitude",
        "delivery_longitude",
        "payment_method",
    } <= quotation_columns


def test_profile_photo_is_persisted_and_rejects_invalid_data(client):
    user = create_user(google_sub="profile-user", email="profile@example.com")
    login_as(client, user)

    response = client.patch(
        "/api/account/profile",
        json={"avatar": "data:image/png;base64,aGVsbG8=", "city": "Lorica"},
    )

    assert response.status_code == 200
    assert response.get_json()["user"]["city"] == "Lorica"
    assert db.session.get(User, user.id).avatar == "data:image/png;base64,aGVsbG8="
    invalid = client.patch("/api/account/profile", json={"avatar": "javascript:alert(1)"})
    assert invalid.status_code == 400


def test_account_settings_requests_a_code_through_mail_sender(client, monkeypatch):
    user = create_user(google_sub="settings-user", email="settings@example.com")
    login_as(client, user)
    sent = []
    monkeypatch.setattr("app._send_settings_code", lambda account, code: sent.append((account.id, code)))

    response = client.post(
        "/api/account/settings/request-code",
        json={
            "name": "Nuevo Nombre",
            "notifications": {
                "notificationsEnabled": True,
                "quoteNotifications": False,
                "responseNotifications": True,
            },
        },
    )

    assert response.status_code == 200
    assert sent and sent[0][0] == user.id
    challenge = SettingsVerification.query.filter_by(user_id=user.id).first()
    assert challenge is not None
    assert challenge.pending_name == "Nuevo Nombre"
    assert challenge.pending_notifications_enabled is True
    assert challenge.pending_quote_notifications is False
    assert challenge.pending_response_notifications is True
    assert "pending_changes" not in {
        column["name"] for column in inspect(db.engine).get_columns("settings_verification")
    }
    verified = client.post(
        "/api/account/settings/verify-code",
        json={"code": sent[0][1]},
    )
    assert verified.status_code == 200
    assert verified.get_json()["user"]["name"] == "Nuevo Nombre"
    assert verified.get_json()["notifications"]["quoteNotifications"] is False
    assert SettingsVerification.query.count() == 0


def test_password_recovery_verifies_code_and_changes_password(client, monkeypatch):
    from werkzeug.security import check_password_hash, generate_password_hash

    user = create_user(
        google_sub="password-reset-user",
        email="reset@example.com",
        password_hash=generate_password_hash("old-password-123"),
    )
    sent = []
    monkeypatch.setattr("app._send_password_reset_code", lambda account, code: sent.append(code))

    request_response = client.post("/api/auth/password/request-code", json={"email": user.email})

    assert request_response.status_code == 200
    challenge = PasswordResetVerification.query.filter_by(user_id=user.id).first()
    assert challenge is not None
    assert challenge.code_hash != sent[0]
    verify_response = client.post(
        "/api/auth/password/verify-code",
        json={"email": user.email, "code": sent[0], "password": "new-password-456"},
    )
    assert verify_response.status_code == 200
    assert check_password_hash(db.session.get(User, user.id).password_hash, "new-password-456")


def test_authenticated_account_can_change_local_password(client):
    from werkzeug.security import check_password_hash, generate_password_hash

    user = create_user(
        google_sub="change-password-user",
        email="change-password@example.com",
        password_hash=generate_password_hash("current-password-123"),
    )
    login_as(client, user)

    wrong_current_password = client.patch(
        "/api/account/password",
        json={"currentPassword": "incorrect-password", "newPassword": "new-password-456"},
    )
    assert wrong_current_password.status_code == 400
    assert not check_password_hash(db.session.get(User, user.id).password_hash, "new-password-456")

    invalid_new_password = client.patch(
        "/api/account/password",
        json={"currentPassword": "current-password-123", "newPassword": "short"},
    )
    assert invalid_new_password.status_code == 400

    changed = client.patch(
        "/api/account/password",
        json={"currentPassword": "current-password-123", "newPassword": "new-password-456"},
    )
    assert changed.status_code == 200
    assert check_password_hash(db.session.get(User, user.id).password_hash, "new-password-456")


def test_password_change_requires_login_and_local_password(client):
    from werkzeug.security import generate_password_hash

    unauthorized = client.patch(
        "/api/account/password",
        json={"currentPassword": "current-password-123", "newPassword": "new-password-456"},
    )
    assert unauthorized.status_code == 401

    google_user = create_user(google_sub="google-password-user", email="google-password@example.com")
    login_as(client, google_user)
    external_account = client.patch(
        "/api/account/password",
        json={"currentPassword": "current-password-123", "newPassword": "new-password-456"},
    )
    assert external_account.status_code == 400

    local_user = create_user(
        google_sub="local-password-user",
        email="local-password@example.com",
        password_hash=generate_password_hash("current-password-123"),
    )
    login_as(client, local_user)
    same_password = client.patch(
        "/api/account/password",
        json={"currentPassword": "current-password-123", "newPassword": "current-password-123"},
    )
    assert same_password.status_code == 400


def test_resend_email_sender_uses_https_api_when_configured(monkeypatch):
    import app as backend

    user = User(google_sub="resend-test-user", email="resend@example.com", name="Resend")
    monkeypatch.setenv("RESEND_API_KEY", "test-key-only")
    monkeypatch.setenv("RESEND_FROM", "AgroCórdoba <test@example.com>")
    called = {}

    class Response:
        def raise_for_status(self):
            return None

    def fake_post(url, **kwargs):
        called.update(url=url, **kwargs)
        return Response()

    monkeypatch.setattr(backend.requests, "post", fake_post)
    backend._send_settings_code(user, "123456")

    assert called["url"] == "https://api.resend.com/emails"
    assert called["headers"]["Authorization"] == "Bearer test-key-only"
    assert called["json"]["to"] == [user.email]
    assert "123456" in called["json"]["text"]


def test_smtp_email_uses_smtp_from_when_resend_sender_is_empty(monkeypatch):
    import app as backend

    user = User(google_sub="smtp-test-user", email="smtp@example.com", name="SMTP")
    sent = {}

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            sent.update(host=host, port=port, timeout=timeout)

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_value, traceback):
            return False

        def starttls(self):
            sent["starttls"] = True

        def send_message(self, message):
            sent["message"] = message

    monkeypatch.setenv("RESEND_FROM", "")
    monkeypatch.setenv("SMTP_FROM", "AgroCórdoba <no-reply@example.com>")
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_USE_SSL", "false")
    monkeypatch.setenv("SMTP_USE_TLS", "true")
    monkeypatch.setattr(backend.smtplib, "SMTP", FakeSMTP)

    backend._send_settings_code(user, "123456")

    assert sent["host"] == "smtp.example.com"
    assert sent["port"] == 587
    assert sent["starttls"] is True
    assert sent["message"]["From"] == "AgroCórdoba <no-reply@example.com>"
    assert sent["message"]["To"] == user.email


def test_password_recovery_rejects_malformed_codes_without_consuming_attempts(client, monkeypatch):
    user = create_user(
        google_sub="malformed-password-reset-user",
        email="malformed-reset@example.com",
    )
    monkeypatch.setattr("app._send_password_reset_code", lambda account, code: None)
    client.post("/api/auth/password/request-code", json={"email": user.email})
    challenge = PasswordResetVerification.query.filter_by(user_id=user.id).first()
    assert challenge is not None

    response = client.post(
        "/api/auth/password/verify-code",
        json={"email": user.email, "code": "123", "password": "new-password-456"},
    )

    assert response.status_code == 400
    assert response.get_json()["error"] == "El código debe tener seis dígitos."
    assert challenge.attempts == 0


def test_google_login_explains_when_oauth_credentials_are_missing(client, monkeypatch):
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    monkeypatch.delenv("GOOGLE_CLIENT_SECRET", raising=False)
    monkeypatch.setenv("FRONTEND_URL", "http://localhost:3000/")

    response = client.get("/auth/google")

    assert response.status_code == 302
    assert response.headers["Location"].startswith("http://localhost:3000/?google_login=setup")


def test_google_login_uses_render_url_when_oauth_is_not_configured(client, monkeypatch):
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    monkeypatch.delenv("GOOGLE_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("FRONTEND_URL", raising=False)
    monkeypatch.setenv("RENDER_EXTERNAL_URL", "https://agrocordoba.onrender.com")

    response = client.get("/auth/google")

    assert response.status_code == 302
    assert response.headers["Location"] == (
        "https://agrocordoba.onrender.com/?google_login=setup"
    )


def test_google_login_uses_render_callback_when_redirect_uri_is_not_configured(
    client, monkeypatch
):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "test-client-secret")
    monkeypatch.delenv("GOOGLE_REDIRECT_URI", raising=False)
    monkeypatch.setenv("RENDER_EXTERNAL_URL", "https://agrocordoba.onrender.com/")
    requested_redirect_uris = []

    def authorize_redirect(redirect_uri):
        requested_redirect_uris.append(redirect_uri)
        return redirect(redirect_uri)

    monkeypatch.setattr(google, "authorize_redirect", authorize_redirect)

    response = client.get("/auth/google")

    assert response.status_code == 302
    assert requested_redirect_uris == [
        "https://agrocordoba.onrender.com/auth/google/callback"
    ]


def test_admin_can_edit_and_delete_a_user_with_related_records(client):
    admin = create_user(google_sub="admin-edit-sub", email="admin-edit@example.com", role="admin")
    producer = create_user(
        google_sub="producer-delete-sub",
        email="producer-delete@example.com",
        role="productor",
        status="activo",
    )
    buyer = create_user(google_sub="buyer-delete-sub", email="buyer-delete@example.com")
    listing = create_listing(producer)
    quote = create_quotation(
        buyer.id,
        producer.id,
        product_id="prod-to-delete",
        product_listing_id=listing.id,
    )
    db.session.add(Favorite(user_id=buyer.id, product_id="prod-to-delete"))
    db.session.commit()
    login_as(client, admin)

    edited = client.patch(
        f"/api/admin/users/{producer.id}",
        json={"name": "Productor actualizado", "email": producer.email, "city": "Lorica", "status": "activo", "farmName": "Finca Nueva", "association": "Cooperativa"},
    )
    assert edited.status_code == 200
    assert edited.get_json()["user"]["name"] == "Productor actualizado"

    deleted = client.delete(f"/api/admin/users/{buyer.id}")
    assert deleted.status_code == 200
    assert db.session.get(User, buyer.id) is None
    assert QuotationRecord.query.filter_by(client_id=buyer.id).count() == 0
    assert Favorite.query.filter_by(user_id=buyer.id).count() == 0

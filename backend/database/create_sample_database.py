"""Create a small SQLite database with synthetic AgroCordoba example data."""

import os
import secrets
import sys
from datetime import datetime, timezone
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = Path(__file__).resolve().parent / "agrocordoba_sample.db"

if OUTPUT_PATH.exists():
    raise SystemExit(
        f"Refusing to overwrite the existing sample database: {OUTPUT_PATH}"
    )

os.environ["DATABASE_URL"] = f"sqlite:///{OUTPUT_PATH.resolve().as_posix()}"
os.environ["FLASK_SECRET_KEY"] = secrets.token_urlsafe(32)
os.environ.pop("ADMIN_EMAIL", None)
os.environ.pop("ADMIN_PASSWORD", None)
os.chdir(BACKEND_ROOT)
sys.path.insert(0, str(BACKEND_ROOT))

from app import (  # noqa: E402
    AccountSettings,
    Favorite,
    ProductListing,
    ProducerProduct,
    ProductCertification,
    QuotationRecord,
    ReadNotification,
    User,
    _apply_product_fields,
    app,
    db,
)

SAMPLE_TIME = datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc)
PRODUCER_ID = "sample-producer-0001"
CLIENT_ID = "sample-client-0001"
PRODUCT_ID = "sample-product-0001"
QUOTATION_ID = "sample-quotation-0001"

with app.app_context():
    producer = User(
        id=PRODUCER_ID,
        google_sub="local:sample-producer",
        email="productora@example.org",
        name="María Ejemplo",
        avatar="/images/campesinos-colombia.jpg",
        role="productor",
        city="Montería",
        business_type="Hogar",
        registered_at=SAMPLE_TIME,
        password_hash=None,
        gender="femenino",
        phone="3000000000",
        farm_name="Finca de Ejemplo",
        association="Asociación Campesina de Ejemplo",
        status="activo",
    )
    client = User(
        id=CLIENT_ID,
        google_sub="local:sample-client",
        email="comprador@example.org",
        name="Carlos Ejemplo",
        avatar="",
        role="cliente",
        city="Montería",
        business_type="Restaurante",
        registered_at=SAMPLE_TIME,
        password_hash=None,
        gender="masculino",
        phone="3000000001",
        farm_name="",
        association="",
        status="activo",
    )
    product = ProductListing(
        id=PRODUCT_ID,
        producer_id=PRODUCER_ID,
        created_at=SAMPLE_TIME,
    )
    _apply_product_fields(
        product,
        {
            "name": "Yuca de ejemplo",
            "variety": "Yuca tradicional",
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
            "image": "/images/yuca-real.jpg",
            "harvestSeason": "Todo el año",
            "certifications": ["Sello de ejemplo ficticio"],
            "packaging": "Sacos",
            "description": "Registro ficticio incluido únicamente como ejemplo de base de datos.",
            "featured": False,
        },
    )
    quotation = QuotationRecord(
        id=QUOTATION_ID,
        client_id=CLIENT_ID,
        producer_id=PRODUCER_ID,
        product_id=PRODUCT_ID,
        product_listing_id=PRODUCT_ID,
        product_name="Yuca",
        product_variety="Yuca tradicional",
        producer_name="María Ejemplo",
        producer_association="Asociación Campesina de Ejemplo",
        producer_whatsapp="3000000000",
        client_name="Carlos Ejemplo",
        client_email="comprador@example.org",
        client_phone="3000000001",
        client_business_type="Restaurante",
        client_city="Montería",
        quantity_kg=50,
        destination_zone="Local Córdoba",
        freight_cop=0,
        subtotal_cop=125000,
        total_cop=125000,
        exchange_rate_cop=4150,
        discount_percent=0,
        notes="Cotización ficticia para ilustrar la relación entre comprador y productor.",
        status="Pendiente",
        created_at=SAMPLE_TIME,
    )

    db.session.add_all(
        [
            producer,
            client,
            product,
            quotation,
            ProducerProduct(user_id=PRODUCER_ID, name="Yuca"),
            AccountSettings(user_id=PRODUCER_ID),
            AccountSettings(user_id=CLIENT_ID),
            Favorite(user_id=CLIENT_ID, product_id=PRODUCT_ID),
            ReadNotification(user_id=CLIENT_ID, quotation_id=QUOTATION_ID),
        ]
    )
    db.session.commit()
    print(f"Created synthetic sample database: {OUTPUT_PATH}")
    for model in (
        User,
        ProducerProduct,
        AccountSettings,
        ProductListing,
        ProductCertification,
        QuotationRecord,
        Favorite,
        ReadNotification,
    ):
        print(f"{model.__tablename__}: {model.query.count()}")

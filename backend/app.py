import os
import base64
import binascii
import hashlib
import hmac
import html
import io
import json
import math
import re
import secrets
import smtplib
import threading
import time
import unicodedata
import uuid
from zipfile import BadZipFile
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path
from urllib.parse import quote, urlencode, urljoin

import click
import requests
from authlib.integrations.flask_client import OAuth
from dotenv import load_dotenv
from flask import Flask, has_app_context, jsonify, redirect, request, send_from_directory, session
from flask_socketio import SocketIO, emit, join_room
from flask_sqlalchemy import SQLAlchemy
from openpyxl import load_workbook
from openpyxl.utils.exceptions import InvalidFileException
from sqlalchemy import inspect, text
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.security import check_password_hash, generate_password_hash

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")


def _get_database_url():
    database_url = os.environ.get("DATABASE_URL", "").strip() or "sqlite:///agrocordoba.db"
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    return database_url


database_url = _get_database_url()

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)
app.config.update(
    SECRET_KEY=os.environ.get("FLASK_SECRET_KEY", ""),
    SQLALCHEMY_DATABASE_URI=database_url,
    SQLALCHEMY_TRACK_MODIFICATIONS=False,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("COOKIE_SECURE", "false").lower() == "true",
)

if not app.config["SECRET_KEY"]:
    raise RuntimeError("Falta FLASK_SECRET_KEY en el archivo .env de la raíz del proyecto.")

db = SQLAlchemy(app)
socketio = SocketIO(app, async_mode="threading")
oauth = OAuth(app)
_quotation_presence_lock = threading.Lock()
_quotation_presence = {}
_socket_user_ids = {}
_socket_quotation_ids = {}

google = oauth.register(
    name="google",
    client_id=os.environ.get("GOOGLE_CLIENT_ID"),
    client_secret=os.environ.get("GOOGLE_CLIENT_SECRET"),
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


class User(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    google_sub = db.Column(db.String(255), unique=True, nullable=False, index=True)
    email = db.Column(db.String(320), unique=True, nullable=False, index=True)
    name = db.Column(db.String(160), nullable=False)
    avatar = db.Column(db.Text, nullable=False, default="")
    role = db.Column(db.String(20), nullable=False, default="cliente")
    city = db.Column(db.String(100), nullable=False, default="Montería")
    business_type = db.Column(db.String(40), nullable=False, default="Hogar")
    registered_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    password_hash = db.Column(db.String(255), nullable=True)
    gender = db.Column(db.String(20), nullable=False, default="neutro")
    phone = db.Column(db.String(30), nullable=False, default="")
    farm_name = db.Column(db.String(160), nullable=False, default="")
    association = db.Column(db.String(200), nullable=False, default="")
    farm_address = db.Column(db.String(500), nullable=False, default="")
    status = db.Column(db.String(20), nullable=False, default="activo")

    def to_public_dict(self):
        settings = AccountSettings.query.filter_by(user_id=self.id).first()
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "phone": self.phone,
            "avatar": self.avatar,
            "businessType": self.business_type,
            "city": self.city,
            "role": self.role,
            "authProvider": "google" if not self.google_sub.startswith("local:") else "local",
            "registeredAt": self.registered_at.isoformat(),
            "status": self.status,
            "gender": self.gender,
            "farmName": self.farm_name,
            "association": self.association,
            "products": [
                item.name
                for item in ProducerProduct.query.filter_by(user_id=self.id).order_by(ProducerProduct.id).all()
            ],
        }

    def to_account_dict(self):
        payload = self.to_public_dict()
        payload["farmAddress"] = self.farm_address
        return payload


class ProducerProduct(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(36), db.ForeignKey("user.id"), nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    __table_args__ = (db.UniqueConstraint("user_id", "name", name="uq_producer_product_name"),)


class AccountSettings(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(36), db.ForeignKey("user.id"), unique=True, nullable=False)
    notifications_enabled = db.Column(db.Boolean, nullable=False, default=True)
    quote_notifications = db.Column(db.Boolean, nullable=False, default=True)
    response_notifications = db.Column(db.Boolean, nullable=False, default=True)


class SettingsVerification(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(36), db.ForeignKey("user.id"), unique=True, nullable=False)
    code_hash = db.Column(db.String(64), nullable=False)
    pending_email = db.Column(db.String(320), nullable=True)
    pending_name = db.Column(db.String(160), nullable=True)
    pending_phone = db.Column(db.String(30), nullable=True)
    pending_notifications_enabled = db.Column(db.Boolean, nullable=True)
    pending_quote_notifications = db.Column(db.Boolean, nullable=True)
    pending_response_notifications = db.Column(db.Boolean, nullable=True)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    sent_at = db.Column(db.DateTime(timezone=True), nullable=False)
    attempts = db.Column(db.Integer, nullable=False, default=0)


class PasswordResetVerification(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(36), db.ForeignKey("user.id"), unique=True, nullable=False)
    code_hash = db.Column(db.String(64), nullable=False)
    expires_at = db.Column(db.DateTime(timezone=True), nullable=False)
    sent_at = db.Column(db.DateTime(timezone=True), nullable=False)
    attempts = db.Column(db.Integer, nullable=False, default=0)


class ProductListing(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    producer_id = db.Column(db.String(36), db.ForeignKey("user.id"), nullable=False, index=True)
    name = db.Column(db.String(120), nullable=False)
    variety = db.Column(db.String(120), nullable=False)
    category = db.Column(db.String(60), nullable=False)
    price_cop_kg = db.Column(db.Float, nullable=False)
    price_usd_kg = db.Column(db.Float, nullable=False)
    stock_available_kg = db.Column(db.Float, nullable=False)
    stock_min_kg = db.Column(db.Float, nullable=False)
    min_order_kg = db.Column(db.Float, nullable=False)
    lat = db.Column(db.Float, nullable=False)
    lng = db.Column(db.Float, nullable=False)
    municipality_id = db.Column(db.String(80), nullable=False)
    municipality_name = db.Column(db.String(100), nullable=False)
    image = db.Column(db.Text, nullable=False, default="")
    harvest_season = db.Column(db.String(120), nullable=False)
    packaging = db.Column(db.String(120), nullable=False)
    description = db.Column(db.String(2000), nullable=False, default="")
    featured = db.Column(db.Boolean, nullable=False, default=False)
    producer_experience_years = db.Column(db.Float, nullable=False, default=0)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    certifications = db.relationship(
        "ProductCertification",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="ProductCertification.id",
    )

    def to_public_dict(self):
        producer = db.session.get(User, self.producer_id)
        product_image = str(self.image or "").strip()
        if not product_image:
            product_image = (
                "/images/yuca-real.jpg"
                if "yuca" in self.name.casefold()
                else "/images/field-aerial-1.webp"
            )
        return {
            **_product_public_fields(self),
            "id": self.id,
            "image": product_image,
            "producerId": self.producer_id,
            "producerName": producer.name if producer else "Productor AgroCórdoba",
            "producerAssociation": producer.association or "Independiente" if producer else "Independiente",
            "producerPhoto": (producer.avatar or "").strip() or "/images/campesinos-colombia.jpg",
            "producerWhatsapp": "".join(char for char in (producer.phone or "") if char.isdigit()) if producer else "",
        }


class ProductCertification(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    product_id = db.Column(db.String(36), db.ForeignKey("product_listing.id"), nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    __table_args__ = (
        db.UniqueConstraint("product_id", "name", name="uq_product_certification_name"),
    )


class QuotationRecord(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    client_id = db.Column(db.String(36), db.ForeignKey("user.id"), nullable=False, index=True)
    producer_id = db.Column(db.String(36), db.ForeignKey("user.id"), nullable=False, index=True)
    product_id = db.Column(db.String(36), nullable=False, index=True)
    product_listing_id = db.Column(
        db.String(36),
        db.ForeignKey("product_listing.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    product_name = db.Column(db.String(120), nullable=False, default="")
    product_variety = db.Column(db.String(120), nullable=False, default="")
    producer_name = db.Column(db.String(160), nullable=False, default="")
    producer_association = db.Column(db.String(200), nullable=False, default="")
    producer_whatsapp = db.Column(db.String(30), nullable=False, default="")
    client_name = db.Column(db.String(160), nullable=False, default="")
    client_email = db.Column(db.String(320), nullable=False, default="")
    client_phone = db.Column(db.String(30), nullable=False, default="")
    client_business_type = db.Column(db.String(40), nullable=False, default="")
    client_city = db.Column(db.String(100), nullable=False, default="")
    quantity_kg = db.Column(db.Float, nullable=False, default=0)
    destination_zone = db.Column(db.String(40), nullable=False, default="")
    fulfillment_method = db.Column(db.String(20), nullable=False, default="domicilio")
    delivery_address = db.Column(db.String(500), nullable=False, default="")
    delivery_latitude = db.Column(db.Float, nullable=True)
    delivery_longitude = db.Column(db.Float, nullable=True)
    payment_method = db.Column(db.String(20), nullable=False, default="transferencia")
    freight_cop = db.Column(db.Float, nullable=False, default=0)
    subtotal_cop = db.Column(db.Float, nullable=False, default=0)
    total_cop = db.Column(db.Float, nullable=False, default=0)
    exchange_rate_cop = db.Column(db.Float, nullable=False, default=4150)
    discount_percent = db.Column(db.Float, nullable=False, default=0)
    notes = db.Column(db.String(1000), nullable=False, default="")
    status = db.Column(db.String(30), nullable=False, default="Pendiente")
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    def to_public_dict(self):
        payload = {
            "productId": self.product_id,
            "productName": self.product_name,
            "productVariety": self.product_variety,
            "producerName": self.producer_name,
            "producerAssociation": self.producer_association,
            "producerWhatsapp": self.producer_whatsapp,
            "clientName": self.client_name,
            "clientEmail": self.client_email,
            "clientPhone": self.client_phone,
            "clientBusinessType": self.client_business_type,
            "clientCity": self.client_city,
            "quantityKg": self.quantity_kg,
            "destinationZone": self.destination_zone,
            "fulfillmentMethod": self.fulfillment_method,
            "paymentMethod": self.payment_method,
            "freightCop": self.freight_cop,
            "subtotalCop": self.subtotal_cop,
            "totalCop": self.total_cop,
            "totalUsd": self.total_cop / self.exchange_rate_cop if self.exchange_rate_cop else 0,
            "discountPercent": self.discount_percent,
            "notes": self.notes,
            "id": self.id,
            "clientId": self.client_id,
            "producerId": self.producer_id,
            "status": self.status,
            "createdAt": self.created_at.isoformat(),
        }
        if self.status in {"Acordado", "Listo para recoger", "Entregado", "Cerrado"}:
            payload.update({
                "deliveryAddress": self.delivery_address,
                "deliveryLatitude": self.delivery_latitude,
                "deliveryLongitude": self.delivery_longitude,
                "producerPickupAddress": (
                    db.session.get(User, self.producer_id).farm_address
                    if self.fulfillment_method == "recoger"
                    and db.session.get(User, self.producer_id)
                    else ""
                ),
            })
        return payload


class QuotationOffer(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    quotation_id = db.Column(
        db.String(36), db.ForeignKey("quotation_record.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sender_id = db.Column(db.String(36), db.ForeignKey("user.id"), nullable=False, index=True)
    sender_name = db.Column(db.String(160), nullable=False)
    unit_price_cop = db.Column(db.Float, nullable=False)
    quantity_kg = db.Column(db.Float, nullable=False)
    freight_cop = db.Column(db.Float, nullable=False, default=0)
    total_cop = db.Column(db.Float, nullable=False)
    reference_product = db.Column(db.String(120), nullable=False)
    reference_price_cop_kg = db.Column(db.Float, nullable=False)
    reference_market = db.Column(db.String(160), nullable=False)
    reference_date = db.Column(db.String(80), nullable=False)
    reference_source_url = db.Column(db.String(500), nullable=False)
    status = db.Column(db.String(20), nullable=False, default="Pendiente")
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    responded_at = db.Column(db.DateTime(timezone=True), nullable=True)

    def to_public_dict(self):
        # SIPSA prices are positive; zero marks an offer without an official reference.
        has_price_reference = self.reference_price_cop_kg > 0
        return {
            "id": self.id,
            "quotationId": self.quotation_id,
            "senderId": self.sender_id,
            "senderName": self.sender_name,
            "unitPriceCop": self.unit_price_cop,
            "quantityKg": self.quantity_kg,
            "freightCop": self.freight_cop,
            "totalCop": self.total_cop,
            "status": self.status,
            "createdAt": self.created_at.isoformat(),
            "respondedAt": self.responded_at.isoformat() if self.responded_at else None,
            "priceReference": (
                {
                    "productName": self.reference_product,
                    "priceCopKg": self.reference_price_cop_kg,
                    "market": self.reference_market,
                    "date": self.reference_date,
                    "sourceUrl": self.reference_source_url,
                }
                if has_price_reference
                else None
            ),
            "priceReferenceUnavailable": (
                None
                if has_price_reference
                else {
                    "reason": self.reference_market,
                    "date": self.reference_date,
                    "sourceUrl": self.reference_source_url,
                }
            ),
        }


class SipsaPriceReference(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    product_key = db.Column(db.String(120), nullable=False)
    product_name = db.Column(db.String(120), nullable=False)
    market = db.Column(db.String(160), nullable=False)
    price_cop_kg = db.Column(db.Float, nullable=False)
    report_date = db.Column(db.Date, nullable=False)
    report_url = db.Column(db.String(500), nullable=False)
    __table_args__ = (
        db.UniqueConstraint(
            "product_key",
            "market",
            "report_date",
            name="uq_sipsa_price_reference_daily",
        ),
        db.Index("ix_sipsa_price_reference_product_date", "product_key", "report_date"),
    )


class QuotationMessage(db.Model):
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    quotation_id = db.Column(
        db.String(36), db.ForeignKey("quotation_record.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sender_id = db.Column(db.String(36), db.ForeignKey("user.id"), nullable=False, index=True)
    sender_name = db.Column(db.String(160), nullable=False)
    content = db.Column(db.String(2000), nullable=False)
    message_type = db.Column(db.String(20), nullable=False, default="text")
    offer_id = db.Column(db.String(36), db.ForeignKey("quotation_offer.id", ondelete="SET NULL"), nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    read_at = db.Column(db.DateTime(timezone=True), nullable=True)
    offer = db.relationship("QuotationOffer")

    def to_public_dict(self):
        return {
            "id": self.id,
            "quotationId": self.quotation_id,
            "senderId": self.sender_id,
            "senderName": self.sender_name,
            "content": self.content,
            "messageType": self.message_type,
            "offer": self.offer.to_public_dict() if self.offer else None,
            "createdAt": self.created_at.isoformat(),
            "readAt": self.read_at.isoformat() if self.read_at else None,
        }


def _product_public_fields(listing):
    return {
        "name": listing.name,
        "variety": listing.variety,
        "category": listing.category,
        "priceCopKg": listing.price_cop_kg,
        "priceUsdKg": listing.price_usd_kg,
        "stockAvailableKg": listing.stock_available_kg,
        "stockMinKg": listing.stock_min_kg,
        "minOrderKg": listing.min_order_kg,
        "lat": listing.lat,
        "lng": listing.lng,
        "municipalityId": listing.municipality_id,
        "municipalityName": listing.municipality_name,
        "image": listing.image,
        "harvestSeason": listing.harvest_season,
        "certifications": [item.name for item in listing.certifications],
        "packaging": listing.packaging,
        "description": listing.description,
        "featured": listing.featured,
        "producerExperienceYears": listing.producer_experience_years,
    }


def _apply_product_fields(listing, data):
    field_map = {
        "name": "name",
        "variety": "variety",
        "category": "category",
        "priceCopKg": "price_cop_kg",
        "priceUsdKg": "price_usd_kg",
        "stockAvailableKg": "stock_available_kg",
        "stockMinKg": "stock_min_kg",
        "minOrderKg": "min_order_kg",
        "lat": "lat",
        "lng": "lng",
        "municipalityId": "municipality_id",
        "municipalityName": "municipality_name",
        "image": "image",
        "harvestSeason": "harvest_season",
        "packaging": "packaging",
        "description": "description",
        "featured": "featured",
        "producerExperienceYears": "producer_experience_years",
    }
    numeric_fields = {
        "priceCopKg",
        "priceUsdKg",
        "stockAvailableKg",
        "stockMinKg",
        "minOrderKg",
        "lat",
        "lng",
        "producerExperienceYears",
    }
    for source, destination in field_map.items():
        default = 0 if source in numeric_fields else False if source == "featured" else ""
        setattr(listing, destination, data.get(source, default))
    listing.certifications[:] = [
        ProductCertification(name=name)
        for name in dict.fromkeys(data.get("certifications", []))
    ]


class Favorite(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(36), db.ForeignKey("user.id"), nullable=False, index=True)
    product_id = db.Column(db.String(120), nullable=False)
    __table_args__ = (db.UniqueConstraint("user_id", "product_id", name="uq_user_favorite_product"),)


class ReadNotification(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(36), db.ForeignKey("user.id"), nullable=False, index=True)
    quotation_id = db.Column(db.String(36), db.ForeignKey("quotation_record.id"), nullable=False)
    __table_args__ = (db.UniqueConstraint("user_id", "quotation_id", name="uq_user_read_notification"),)


PRODUCT_CATEGORIES = {
    "Cereales", "Tubérculos y Raíces", "Frutas Tropicales",
    "Cacao y Café", "Agroindustria y Derivados", "Otros cultivos",
}


def _product_payload(payload):
    if not isinstance(payload, dict):
        return None, "Los datos del producto no son válidos."
    name = str(payload.get("name", "")).strip()
    category = str(payload.get("category", ""))
    if not name or len(name) > 120 or category not in PRODUCT_CATEGORIES:
        return None, "Escribe un nombre y una categoría válidos."
    if any(len(str(payload.get(field, ""))) > limit for field, limit in (("variety", 120), ("municipalityId", 80), ("municipalityName", 100), ("image", 2_500_000), ("harvestSeason", 120), ("packaging", 120), ("description", 2000))):
        return None, "Uno de los campos supera el tamaño permitido."
    values = {}
    for field in ("priceCopKg", "priceUsdKg", "stockAvailableKg", "stockMinKg", "minOrderKg", "lat", "lng", "producerExperienceYears"):
        try:
            number = float(payload.get(field, 0) or 0)
        except (TypeError, ValueError):
            return None, "Los valores de precio, inventario o ubicación no son válidos."
        if number > 1_000_000_000 or (field not in {"lat", "lng"} and number < 0):
            return None, "Los valores de precio o inventario están fuera del rango permitido."
        if field == "lat" and not -90 <= number <= 90:
            return None, "La latitud debe estar entre -90 y 90."
        if field == "lng" and not -180 <= number <= 180:
            return None, "La longitud debe estar entre -180 y 180."
        values[field] = number
    if values["priceCopKg"] <= 0 or values["stockMinKg"] <= 0 or values["minOrderKg"] <= 0:
        return None, "El precio, el mínimo de inventario y el pedido mínimo deben ser mayores que cero."
    certifications = payload.get("certifications", [])
    if not isinstance(certifications, list) or len(certifications) > 20 or any(not isinstance(item, str) or len(item) > 100 for item in certifications):
        return None, "La lista de certificaciones no es válida."
    values.update({
        "name": name,
        "variety": str(payload.get("variety", "")).strip() or name,
        "category": category,
        "municipalityId": str(payload.get("municipalityId", "")),
        "municipalityName": str(payload.get("municipalityName", "")),
        "image": str(payload.get("image", "")),
        "harvestSeason": str(payload.get("harvestSeason", "Consultar con el productor")),
        "certifications": [item.strip() for item in certifications],
        "packaging": str(payload.get("packaging", "Consultar con el productor")),
        "description": str(payload.get("description", "")),
        "featured": bool(payload.get("featured", False)),
    })
    return values, None


@app.get("/api/products")
def list_products():
    listings = ProductListing.query.join(User, ProductListing.producer_id == User.id).filter(User.status == "activo").order_by(ProductListing.created_at.desc()).all()
    return jsonify({"products": [listing.to_public_dict() for listing in listings]})


@app.post("/api/products")
def create_product():
    user = _current_user()
    if user is None:
        return jsonify({"error": "Inicia sesión para publicar un producto."}), 401
    if user.role != "productor":
        return jsonify({"error": "Solo las cuentas de productor pueden publicar productos."}), 403
    if user.status != "activo":
        return jsonify({"error": "Tu cuenta de productor está pendiente de aprobación."}), 403
    data, error = _product_payload(request.get_json(silent=True))
    if error:
        return jsonify({"error": error}), 400
    listing = ProductListing(producer_id=user.id)
    _apply_product_fields(listing, data)
    db.session.add(listing)
    db.session.commit()
    return jsonify({"product": listing.to_public_dict()}), 201


@app.post("/api/admin/products")
def admin_create_product():
    admin = _current_user()
    if admin is None or admin.role != "admin":
        return jsonify({"error": "Se requiere una sesión de administrador."}), 403
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Los datos del producto no son válidos."}), 400
    producer = db.session.get(User, str(payload.get("producerId", "")))
    if producer is None or producer.role != "productor" or producer.status != "activo":
        return jsonify({"error": "Selecciona un productor activo."}), 400
    data, error = _product_payload(payload)
    if error:
        return jsonify({"error": error}), 400
    listing = ProductListing(producer_id=producer.id)
    _apply_product_fields(listing, data)
    db.session.add(listing)
    db.session.commit()
    return jsonify({"product": listing.to_public_dict()}), 201


@app.put("/api/products/<string:product_id>")
def update_product(product_id):
    user = _current_user()
    if user is None:
        return jsonify({"error": "Inicia sesión para editar un producto."}), 401
    listing = db.session.get(ProductListing, product_id)
    if listing is None:
        return jsonify({"error": "No se encontró el producto."}), 404
    if user.role not in {"productor", "admin"}:
        return jsonify({"error": "No tienes permiso para editar productos."}), 403
    if user.role == "productor" and listing.producer_id != user.id:
        return jsonify({"error": "No tienes permiso para editar este producto."}), 403
    if user.role == "productor" and user.status != "activo":
        return jsonify({"error": "Tu cuenta no está aprobada para administrar publicaciones."}), 403
    data, error = _product_payload(request.get_json(silent=True))
    if error:
        return jsonify({"error": error}), 400
    _apply_product_fields(listing, data)
    db.session.commit()
    return jsonify({"product": listing.to_public_dict()})


@app.delete("/api/products/<string:product_id>")
def delete_product(product_id):
    user = _current_user()
    if user is None:
        return jsonify({"error": "Inicia sesión para eliminar un producto."}), 401
    listing = db.session.get(ProductListing, product_id)
    if listing is None:
        return jsonify({"error": "No se encontró el producto."}), 404
    if user.role not in {"productor", "admin"}:
        return jsonify({"error": "No tienes permiso para eliminar productos."}), 403
    if user.role == "productor" and listing.producer_id != user.id:
        return jsonify({"error": "No tienes permiso para eliminar este producto."}), 403
    if user.role == "productor" and user.status != "activo":
        return jsonify({"error": "Tu cuenta no está aprobada para administrar publicaciones."}), 403
    QuotationRecord.query.filter_by(product_listing_id=listing.id).update(
        {QuotationRecord.product_listing_id: None},
        synchronize_session=False,
    )
    db.session.delete(listing)
    db.session.commit()
    return jsonify({"ok": True})


@app.get("/api/quotations")
def list_quotations():
    user = _current_user()
    if user is None:
        return jsonify({"error": "Inicia sesión para consultar tus cotizaciones."}), 401
    query = QuotationRecord.query
    if user.role == "cliente":
        query = query.filter_by(client_id=user.id)
    elif user.role == "productor":
        if user.status != "activo":
            return jsonify({"error": "Tu cuenta de productor está pendiente de aprobación."}), 403
        query = query.filter_by(producer_id=user.id)
    elif user.role != "admin":
        return jsonify({"error": "Esta cuenta no puede consultar cotizaciones."}), 403
    rows = query.order_by(QuotationRecord.created_at.desc()).all()
    return jsonify({"quotations": [quotation.to_public_dict() for quotation in rows]})


def _unread_message_count(user_id, quotation_id):
    return QuotationMessage.query.filter(
        QuotationMessage.quotation_id == quotation_id,
        QuotationMessage.sender_id != user_id,
        QuotationMessage.read_at.is_(None),
    ).count()


@app.get("/api/notifications/unread-messages")
def list_unread_message_counts():
    user = _current_user()
    if user is None:
        return jsonify({"error": "Inicia sesión para consultar tus mensajes pendientes."}), 401
    if user.role not in {"cliente", "productor"}:
        return jsonify({"error": "Esta cuenta no puede consultar mensajes pendientes."}), 403
    if user.role == "productor" and user.status != "activo":
        return jsonify({"error": "Tu cuenta de productor está pendiente de aprobación."}), 403

    quotation_column = (
        QuotationRecord.client_id if user.role == "cliente" else QuotationRecord.producer_id
    )
    rows = (
        db.session.query(QuotationMessage.quotation_id, db.func.count(QuotationMessage.id))
        .join(QuotationRecord, QuotationRecord.id == QuotationMessage.quotation_id)
        .filter(
            quotation_column == user.id,
            QuotationMessage.sender_id != user.id,
            QuotationMessage.read_at.is_(None),
        )
        .group_by(QuotationMessage.quotation_id)
        .all()
    )
    return jsonify({"counts": {quotation_id: count for quotation_id, count in rows}})


@app.post("/api/quotations")
def create_quotation():
    user = _current_user()
    if user is None:
        return jsonify({"error": "Inicia sesión para solicitar una cotización."}), 401
    if user.role != "cliente":
        return jsonify({"error": "Solo una cuenta de comprador puede solicitar cotizaciones."}), 403
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Los datos de la cotización no son válidos."}), 400
    product_id = str(payload.get("productId", ""))
    listing = db.session.get(ProductListing, product_id)
    if listing is None:
        return jsonify({"error": "Este producto no está publicado en el backend."}), 404
    try:
        quantity = float(payload.get("quantityKg", 0))
        freight = float(payload.get("freightCop", 0))
    except (TypeError, ValueError):
        return jsonify({"error": "La cantidad o el transporte no son válidos."}), 400
    product = listing.to_public_dict()
    if quantity < product["minOrderKg"] or quantity > product["stockAvailableKg"]:
        return jsonify({"error": "La cantidad debe respetar el pedido mínimo y el inventario disponible."}), 400
    if freight < 0 or freight > 100_000_000:
        return jsonify({"error": "El costo de transporte no es válido."}), 400
    destination = str(payload.get("destinationZone", ""))
    destinations = {"Local Córdoba", "Medellín / Antioquia", "Bogotá D.C.", "Costa Caribe", "Internacional"}
    if destination not in destinations:
        return jsonify({"error": "Selecciona un destino válido."}), 400
    fulfillment_method = str(payload.get("fulfillmentMethod", "domicilio"))
    if fulfillment_method not in {"domicilio", "recoger"}:
        return jsonify({"error": "Selecciona domicilio o recoger en el punto de origen."}), 400
    payment_method = str(payload.get("paymentMethod", "transferencia"))
    if payment_method not in {"efectivo", "transferencia"}:
        return jsonify({"error": "Selecciona efectivo o transferencia como forma de pago."}), 400
    delivery_address = str(payload.get("deliveryAddress", "")).strip()
    delivery_latitude = payload.get("deliveryLatitude")
    delivery_longitude = payload.get("deliveryLongitude")
    if fulfillment_method == "domicilio" and "fulfillmentMethod" in payload and not delivery_address:
        return jsonify({"error": "Indica la dirección de entrega para solicitar domicilio."}), 400
    if len(delivery_address) > 500:
        return jsonify({"error": "La dirección de entrega no puede superar 500 caracteres."}), 400
    if (delivery_latitude is None) != (delivery_longitude is None):
        return jsonify({"error": "La ubicación debe incluir latitud y longitud."}), 400
    if delivery_latitude is not None:
        try:
            delivery_latitude = float(delivery_latitude)
            delivery_longitude = float(delivery_longitude)
        except (TypeError, ValueError):
            return jsonify({"error": "Las coordenadas de entrega no son válidas."}), 400
        if (
            not math.isfinite(delivery_latitude)
            or not math.isfinite(delivery_longitude)
            or not -90 <= delivery_latitude <= 90
            or not -180 <= delivery_longitude <= 180
        ):
            return jsonify({"error": "Las coordenadas de entrega están fuera de rango."}), 400
    if fulfillment_method == "recoger":
        delivery_address = ""
        delivery_latitude = None
        delivery_longitude = None
    discount = 10 if quantity >= 5000 else 7 if quantity >= 2000 else 4 if quantity >= 500 else 0
    subtotal = quantity * product["priceCopKg"] * (1 - discount / 100)
    total = subtotal + freight
    producer = db.session.get(User, listing.producer_id)
    quotation = QuotationRecord(
        client_id=user.id,
        producer_id=listing.producer_id,
        product_id=listing.id,
        product_listing_id=listing.id,
        product_name=product["name"].split()[0],
        product_variety=product["variety"],
        producer_name=producer.name,
        producer_association=producer.association or "Independiente",
        producer_whatsapp="".join(char for char in (producer.phone or "") if char.isdigit()),
        client_name=user.name,
        client_email=user.email,
        client_phone=user.phone,
        client_business_type=user.business_type,
        client_city=user.city,
        quantity_kg=quantity,
        destination_zone=destination,
        fulfillment_method=fulfillment_method,
        delivery_address=delivery_address,
        delivery_latitude=delivery_latitude,
        delivery_longitude=delivery_longitude,
        payment_method=payment_method,
        freight_cop=freight,
        subtotal_cop=subtotal,
        total_cop=total,
        exchange_rate_cop=4150,
        discount_percent=discount,
        notes=str(payload.get("notes", "")).strip()[:1000],
    )
    db.session.add(quotation)
    db.session.commit()
    public_quotation = quotation.to_public_dict()
    _emit_quotation_update(public_quotation)
    return jsonify({"quotation": public_quotation}), 201


@app.patch("/api/quotations/<string:quotation_id>")
def update_quotation_status(quotation_id):
    user = _current_user()
    if user is None:
        return jsonify({"error": "Inicia sesión para actualizar la cotización."}), 401
    if user.role not in {"productor", "cliente"}:
        return jsonify({"error": "Esta cuenta no puede actualizar el estado de la cotización."}), 403
    if user.role == "productor" and user.status != "activo":
        return jsonify({"error": "Tu cuenta no está aprobada para gestionar cotizaciones."}), 403
    quotation = db.session.get(QuotationRecord, quotation_id)
    if quotation is None:
        return jsonify({"error": "No se encontró la cotización."}), 404
    if user.id not in {quotation.client_id, quotation.producer_id}:
        return jsonify({"error": "No tienes permiso para cambiar esta cotización."}), 403
    payload = request.get_json(silent=True) or {}
    status = str(payload.get("status", ""))
    if user.id == quotation.producer_id:
        if status in {"Cotizado", "Contactado WhatsApp"}:
            if quotation.status not in {"Pendiente", "Cotizado", "Contactado WhatsApp", "En negociación"}:
                return jsonify({"error": "Esta cotización ya no está en negociación."}), 409
        elif status == "Entregado" and quotation.fulfillment_method == "domicilio":
            if quotation.status != "Acordado":
                return jsonify({"error": "Solo puedes marcar como entregado un pedido acordado."}), 409
        elif status == "Listo para recoger" and quotation.fulfillment_method == "recoger":
            if quotation.status != "Acordado":
                return jsonify({"error": "Solo puedes preparar para recoger un pedido acordado."}), 409
            producer = db.session.get(User, quotation.producer_id)
            if not producer or not producer.farm_address.strip():
                return jsonify({"error": "Completa la dirección privada de recogida en la configuración de tu cuenta."}), 400
        else:
            return jsonify({"error": "El estado solicitado no corresponde a una acción del productor."}), 400
    else:
        if status != "Cerrado" or quotation.status not in {"Entregado", "Listo para recoger"}:
            return jsonify({"error": "Solo puedes cerrar el pedido después de que el producto esté entregado o listo para recoger."}), 409
        if quotation.status == "Listo para recoger" and quotation.fulfillment_method != "recoger":
            return jsonify({"error": "Este pedido no está configurado para recogida."}), 409
    quotation.status = status
    db.session.commit()
    public_quotation = quotation.to_public_dict()
    _emit_quotation_update(public_quotation)
    return jsonify({"quotation": public_quotation})


def _delete_account_data(account):
    quotation_ids = [
        row[0]
        for row in db.session.query(QuotationRecord.id).filter(
            (QuotationRecord.client_id == account.id) | (QuotationRecord.producer_id == account.id)
        )
    ]
    listing_ids = [
        row[0]
        for row in db.session.query(ProductListing.id).filter_by(producer_id=account.id)
    ]

    ProducerProduct.query.filter_by(user_id=account.id).delete(synchronize_session=False)
    Favorite.query.filter_by(user_id=account.id).delete(synchronize_session=False)
    ReadNotification.query.filter_by(user_id=account.id).delete(synchronize_session=False)
    AccountSettings.query.filter_by(user_id=account.id).delete(synchronize_session=False)
    SettingsVerification.query.filter_by(user_id=account.id).delete(synchronize_session=False)
    PasswordResetVerification.query.filter_by(user_id=account.id).delete(synchronize_session=False)
    if quotation_ids:
        ReadNotification.query.filter(ReadNotification.quotation_id.in_(quotation_ids)).delete(
            synchronize_session=False
        )
        QuotationOffer.query.filter(QuotationOffer.quotation_id.in_(quotation_ids)).delete(
            synchronize_session=False
        )
        QuotationMessage.query.filter(QuotationMessage.quotation_id.in_(quotation_ids)).delete(
            synchronize_session=False
        )
        QuotationRecord.query.filter(QuotationRecord.id.in_(quotation_ids)).delete(
            synchronize_session=False
        )
    if listing_ids:
        ProductCertification.query.filter(ProductCertification.product_id.in_(listing_ids)).delete(
            synchronize_session=False
        )
        ProductListing.query.filter(ProductListing.id.in_(listing_ids)).delete(
            synchronize_session=False
        )

    db.session.delete(account)


@app.delete("/api/account")
def delete_own_account():
    account = _current_user()
    if account is None:
        return jsonify({"error": "Inicia sesión para eliminar tu cuenta."}), 401
    if account.role not in {"cliente", "productor"}:
        return jsonify({"error": "Solo los clientes y productores pueden eliminar su cuenta desde aquí."}), 403

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Confirma tu correo y la eliminación de la cuenta."}), 400
    if str(payload.get("email", "")).strip().casefold() != account.email.casefold():
        return jsonify({"error": "El correo no coincide con la cuenta iniciada."}), 400
    if payload.get("confirmation") != "ELIMINAR MI CUENTA":
        return jsonify({"error": "Escribe ELIMINAR MI CUENTA para confirmar la acción."}), 400

    password = str(payload.get("currentPassword", ""))
    if account.password_hash:
        if not password or not check_password_hash(account.password_hash, password):
            return jsonify({"error": "La contraseña actual no es correcta."}), 400
    elif account.google_sub.startswith("local:"):
        return jsonify({"error": "No se puede verificar la identidad de esta cuenta local."}), 400

    _delete_account_data(account)
    db.session.commit()
    session.clear()
    return jsonify({"ok": True})


DANE_SIPSA_PAGE_URL = (
    "https://www.dane.gov.co/index.php/estadisticas-por-tema/agropecuario/"
    "sistema-de-informacion-de-precios-sipsa/componente-precios-mayoristas"
)
DANE_SIPSA_SOURCE_URL = "https://www.dane.gov.co"
SIPSA_CACHE_SECONDS = 3600
_sipsa_cache_lock = threading.Lock()
_sipsa_cache = {"expires_at": 0.0, "rows": [], "report_date": "", "report_url": ""}
SPANISH_MONTHS = {
    "enero": 1,
    "febrero": 2,
    "marzo": 3,
    "abril": 4,
    "mayo": 5,
    "junio": 6,
    "julio": 7,
    "agosto": 8,
    "septiembre": 9,
    "setiembre": 9,
    "octubre": 10,
    "noviembre": 11,
    "diciembre": 12,
}
SPANISH_MONTH_ABBREVIATIONS = {
    "ene": 1,
    "feb": 2,
    "mar": 3,
    "abr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "ago": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dic": 12,
}


def _parse_open_data_date(value):
    normalized = unicodedata.normalize("NFD", str(value).casefold())
    normalized = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    match = re.search(r"\b(\d{1,2}) de ([a-z]+) de (\d{4})\b", normalized)
    if not match:
        return None
    month = SPANISH_MONTHS.get(match.group(2))
    if not month:
        return None
    try:
        return datetime(int(match.group(3)), month, int(match.group(1)))
    except ValueError:
        return None


def _normalize_price_product(value):
    normalized = unicodedata.normalize("NFD", str(value).casefold())
    normalized = "".join(char for char in normalized if unicodedata.category(char) != "Mn")
    return re.sub(r"[^a-z0-9 ]", " ", normalized).strip()


def _latest_sipsa_report_url(links):
    dated_links = []
    for link in links:
        match = re.search(r"anex-SIPSADiario-(\d{1,2})([a-z]{3})(\d{4})\.xlsx$", link, re.IGNORECASE)
        if not match:
            continue
        month = SPANISH_MONTH_ABBREVIATIONS.get(match.group(2).lower())
        if not month:
            continue
        try:
            report_date = datetime(int(match.group(3)), month, int(match.group(1)))
        except ValueError:
            continue
        dated_links.append((report_date, link))
    if not dated_links:
        raise ValueError("La página de DANE no publicó un anexo diario SIPSA con fecha reconocible.")
    return urljoin(DANE_SIPSA_PAGE_URL, max(dated_links, key=lambda item: item[0])[1])


def _fetch_latest_sipsa_report():
    page_response = requests.get(DANE_SIPSA_PAGE_URL, timeout=(3, 10))
    page_response.raise_for_status()
    links = re.findall(
        r"""href=["']([^"']*?/files/operaciones/SIPSA/anex-SIPSADiario-[^"']+\.xlsx)["']""",
        page_response.text,
        flags=re.IGNORECASE,
    )
    if not links:
        raise ValueError("La página de DANE no publicó un anexo diario SIPSA.")
    report_url = _latest_sipsa_report_url(links)
    report_response = requests.get(report_url, timeout=(3, 20))
    report_response.raise_for_status()
    workbook = load_workbook(io.BytesIO(report_response.content), read_only=True, data_only=True)
    try:
        sheet = workbook.active
        title = str(sheet["A2"].value or "")
        report_date = _parse_open_data_date(title)
        if report_date is None:
            raise ValueError("El anexo diario SIPSA no contiene una fecha reconocible.")
        markets = next(sheet.iter_rows(min_row=3, max_row=3, values_only=True))
        rows = []
        for values in sheet.iter_rows(min_row=5, values_only=True):
            product_name = str(values[0] or "").strip().rstrip("*").strip() if values else ""
            if not product_name:
                continue
            for price_column in range(1, len(values), 2):
                market = str(markets[price_column] or "").replace("\n", " ").strip()
                if not market:
                    continue
                price = values[price_column]
                try:
                    price = float(price)
                except (TypeError, ValueError):
                    continue
                if not math.isfinite(price) or price <= 0:
                    continue
                rows.append(
                    {
                        "productName": product_name,
                        "market": market,
                        "priceCopKg": price,
                        "date": report_date.strftime("%Y-%m-%d"),
                        "reportUrl": report_url,
                    }
                )
        return rows, report_date.strftime("%Y-%m-%d"), report_url
    finally:
        workbook.close()


def _get_latest_sipsa_rows():
    now = time.monotonic()
    if now < _sipsa_cache["expires_at"]:
        return _sipsa_cache["rows"], _sipsa_cache["report_date"], _sipsa_cache["report_url"]
    with _sipsa_cache_lock:
        now = time.monotonic()
        if now < _sipsa_cache["expires_at"]:
            return _sipsa_cache["rows"], _sipsa_cache["report_date"], _sipsa_cache["report_url"]
        rows, report_date, report_url = _fetch_latest_sipsa_report()
        _sipsa_cache.update(
            rows=rows,
            report_date=report_date,
            report_url=report_url,
            expires_at=time.monotonic() + SIPSA_CACHE_SECONDS,
        )
        return rows, report_date, report_url


def _price_reference_items(rows, product):
    normalized_query = _normalize_price_product(product)
    exact_matches = [
        row for row in rows
        if _normalize_price_product(row["productName"]) == normalized_query
    ]
    if exact_matches:
        matched_rows = exact_matches
    else:
        query_root = normalized_query.split(" ", 1)[0]
        matched_rows = [
            row for row in rows
            if _normalize_price_product(row["productName"]).split(" ", 1)[0] == query_root
        ]
    matched_rows.sort(
        key=lambda row: (
            0 if "monteria" in _normalize_price_product(row["market"]) else 1,
            row["productName"],
            row["market"],
        )
    )
    references = [
        {
            "productName": row["productName"],
            "market": row["market"],
            "city": row["market"].split(",", 1)[0],
            "meanPriceCop": row["priceCopKg"],
            "date": row["date"],
        }
        for row in matched_rows[:10]
    ]
    return references


def _persist_sipsa_report(rows, report_date, report_url, force=False):
    parsed_report_date = datetime.strptime(report_date, "%Y-%m-%d").date()
    existing_report = SipsaPriceReference.query.filter_by(
        report_date=parsed_report_date,
        report_url=report_url,
    ).first()
    if existing_report and not force:
        return 0

    records = {}
    for row in rows:
        product_name = str(row.get("productName", "")).strip()
        market = str(row.get("market", "")).strip()
        product_key = _normalize_price_product(product_name)
        try:
            price = float(row.get("priceCopKg"))
        except (TypeError, ValueError):
            continue
        if not product_key or not market or not math.isfinite(price) or price <= 0:
            continue
        records[(product_key, market, parsed_report_date)] = {
            "product_key": product_key,
            "product_name": product_name,
            "market": market,
            "price_cop_kg": price,
            "report_date": parsed_report_date,
            "report_url": report_url,
        }

    if not records:
        raise ValueError("El anexo SIPSA no contiene referencias de precios válidas.")

    values = list(records.values())
    dialect = db.engine.dialect.name
    if dialect == "postgresql":
        statement = postgresql_insert(SipsaPriceReference).values(values)
    elif dialect == "sqlite":
        statement = sqlite_insert(SipsaPriceReference).values(values)
    else:
        for value in values:
            existing = SipsaPriceReference.query.filter_by(
                product_key=value["product_key"],
                market=value["market"],
                report_date=value["report_date"],
            ).first()
            if existing is None:
                db.session.add(SipsaPriceReference(**value))
            else:
                for key, item in value.items():
                    setattr(existing, key, item)
        db.session.commit()
        return len(values)

    statement = statement.on_conflict_do_update(
        index_elements=["product_key", "market", "report_date"],
        set_={
            "product_name": statement.excluded.product_name,
            "price_cop_kg": statement.excluded.price_cop_kg,
            "report_url": statement.excluded.report_url,
        },
    )
    db.session.execute(statement)
    db.session.commit()
    return len(values)


def _saved_sipsa_price_references(product):
    normalized_query = _normalize_price_product(product)
    query_root = normalized_query.split(" ", 1)[0]
    saved_rows = (
        SipsaPriceReference.query.filter(
            SipsaPriceReference.product_key.in_({normalized_query, query_root})
        )
        .order_by(SipsaPriceReference.report_date.desc())
        .all()
    )
    exact_matches = [row for row in saved_rows if row.product_key == normalized_query]
    matched_rows = exact_matches or [
        row for row in saved_rows if row.product_key.split(" ", 1)[0] == query_root
    ]
    if not matched_rows:
        return [], "", ""

    latest_date = max(row.report_date for row in matched_rows)
    matched_rows = [row for row in matched_rows if row.report_date == latest_date]
    matched_rows.sort(
        key=lambda row: (
            0 if "monteria" in _normalize_price_product(row.market) else 1,
            row.product_name,
            row.market,
        )
    )
    references = [
        {
            "productName": row.product_name,
            "market": row.market,
            "city": row.market.split(",", 1)[0],
            "meanPriceCop": row.price_cop_kg,
            "date": row.report_date.isoformat(),
        }
        for row in matched_rows[:10]
    ]
    return references, latest_date.isoformat(), matched_rows[0].report_url


def _get_sipsa_price_references(product):
    rows, report_date, report_url = _get_latest_sipsa_rows()
    if has_app_context() and rows:
        _persist_sipsa_report(rows, report_date, report_url)
    references = _price_reference_items(rows, product)
    return references, report_date, report_url


def _official_price_snapshot(product):
    references, report_date, report_url = _get_sipsa_price_references(product)
    if not references:
        return None, report_date, report_url
    return references[0], report_date, report_url


def _sipsa_source_metadata():
    return {
        "name": "DANE — SIPSA, boletín diario de precios mayoristas",
        "datasetUrl": DANE_SIPSA_PAGE_URL,
        "coverage": "Mercados mayoristas cubiertos por SIPSA, incluido Montería cuando hay dato para el producto.",
        "unit": "COP/kg",
    }


def _price_reference_payload(product, references, report_date, report_url, fallback=False):
    return {
        "product": product,
        "references": references,
        "reportDate": report_date,
        "reportUrl": report_url,
        "source": _sipsa_source_metadata(),
        "fallbackToStoredData": fallback,
    }


@app.get("/api/price-references")
def list_price_references():
    product = str(request.args.get("product", "")).strip()
    if not product or len(product) > 120:
        return jsonify({"error": "Indica un producto válido para consultar el precio de referencia."}), 400
    try:
        references, report_date, report_url = _get_sipsa_price_references(product)
    except (requests.RequestException, ValueError, OSError, BadZipFile, InvalidFileException) as error:
        app.logger.warning("No se pudo consultar el anexo oficial de precios SIPSA: %s", error)
        try:
            references, report_date, report_url = _saved_sipsa_price_references(product)
        except SQLAlchemyError as database_error:
            db.session.rollback()
            app.logger.error("No se pudo leer la referencia SIPSA guardada: %s", database_error)
            return jsonify({"error": "No fue posible leer la referencia SIPSA guardada."}), 503
        if not references:
            return jsonify({"error": "No se pudo consultar el precio mayorista oficial del DANE y no hay datos guardados."}), 502
        return jsonify(_price_reference_payload(product, references, report_date, report_url, fallback=True))
    except SQLAlchemyError as error:
        db.session.rollback()
        app.logger.error("No se pudo guardar la referencia SIPSA: %s", error)
        return jsonify({"error": "No fue posible consultar y guardar la referencia SIPSA."}), 503
    return jsonify(_price_reference_payload(product, references, report_date, report_url))


@app.get("/api/price-references/batch")
def list_price_references_batch():
    products = list(dict.fromkeys(str(value).strip() for value in request.args.getlist("product")))
    if not products or len(products) > 50 or any(not product or len(product) > 120 for product in products):
        return jsonify({"error": "Indica entre 1 y 50 nombres de producto válidos."}), 400

    try:
        rows, report_date, report_url = _get_latest_sipsa_rows()
        if rows:
            _persist_sipsa_report(rows, report_date, report_url)
        results = {
            product: _price_reference_payload(
                product,
                _price_reference_items(rows, product),
                report_date,
                report_url,
            )
            for product in products
        }
        return jsonify({"referencesByProduct": results})
    except (requests.RequestException, ValueError, OSError, BadZipFile, InvalidFileException) as error:
        app.logger.warning("No se pudo consultar el anexo oficial de precios SIPSA: %s", error)
        results = {}
        try:
            for product in products:
                references, report_date, report_url = _saved_sipsa_price_references(product)
                results[product] = _price_reference_payload(
                    product,
                    references,
                    report_date,
                    report_url,
                    fallback=bool(references),
                )
        except SQLAlchemyError as database_error:
            db.session.rollback()
            app.logger.error("No se pudieron leer referencias SIPSA guardadas: %s", database_error)
            return jsonify({"error": "No fue posible leer las referencias SIPSA guardadas."}), 503
        if not any(result["references"] for result in results.values()):
            return jsonify({"error": "No se pudo consultar el precio SIPSA y no hay datos guardados."}), 502
        return jsonify({"referencesByProduct": results})
    except SQLAlchemyError as error:
        db.session.rollback()
        app.logger.error("No se pudo guardar la referencia SIPSA por lote: %s", error)
        return jsonify({"error": "No fue posible consultar y guardar las referencias SIPSA."}), 503


@app.post("/api/tasks/price-references/refresh")
def refresh_price_references():
    expected_token = os.environ.get("SIPSA_TASK_TOKEN", "").strip()
    if not expected_token:
        return jsonify({"error": "La tarea diaria SIPSA no está configurada."}), 503
    supplied_token = request.headers.get("Authorization", "")
    if not hmac.compare_digest(
        supplied_token.encode("utf-8"),
        f"Bearer {expected_token}".encode("utf-8"),
    ):
        return jsonify({"error": "No tienes autorización para ejecutar esta tarea."}), 403
    try:
        rows, report_date, report_url = _fetch_latest_sipsa_report()
        stored_count = _persist_sipsa_report(rows, report_date, report_url, force=True)
    except (requests.RequestException, ValueError, OSError, BadZipFile, InvalidFileException) as error:
        app.logger.error("Falló la actualización programada SIPSA: %s", error)
        return jsonify({"error": "No fue posible actualizar las referencias SIPSA desde el DANE."}), 502
    except SQLAlchemyError as error:
        db.session.rollback()
        app.logger.error("No se pudieron persistir las referencias SIPSA: %s", error)
        return jsonify({"error": "No fue posible guardar las referencias SIPSA."}), 503

    _sipsa_cache.update(
        rows=rows,
        report_date=report_date,
        report_url=report_url,
        expires_at=time.monotonic() + SIPSA_CACHE_SECONDS,
    )
    return jsonify(
        {
            "ok": True,
            "reportDate": report_date,
            "reportUrl": report_url,
            "storedRows": stored_count,
        }
    )


@app.get("/api/favorites")
def list_favorites():
    user = _current_user()
    if user is None or user.role != "cliente":
        return jsonify({"error": "Inicia sesión como comprador para consultar favoritos."}), 403
    ids = [row.product_id for row in Favorite.query.filter_by(user_id=user.id).all()]
    return jsonify({"favoriteIds": ids})


@app.put("/api/favorites")
def replace_favorites():
    user = _current_user()
    if user is None or user.role != "cliente":
        return jsonify({"error": "Inicia sesión como comprador para guardar favoritos."}), 403
    payload = request.get_json(silent=True) or {}
    ids = payload.get("favoriteIds") if isinstance(payload, dict) else None
    if not isinstance(ids, list) or len(ids) > 500 or any(
        not isinstance(item, str) or not item.strip() or len(item) > 120 for item in ids
    ):
        return jsonify({"error": "La lista de favoritos no es válida."}), 400
    Favorite.query.filter_by(user_id=user.id).delete()
    db.session.add_all(
        Favorite(user_id=user.id, product_id=product_id)
        for product_id in dict.fromkeys(ids)
    )
    db.session.commit()
    return jsonify({"favoriteIds": list(dict.fromkeys(ids))})


@app.get("/api/notifications/read")
def list_read_notifications():
    user = _current_user()
    if user is None or user.role != "cliente":
        return jsonify({"error": "Inicia sesión como comprador para consultar tus avisos."}), 403
    ids = [row.quotation_id for row in ReadNotification.query.filter_by(user_id=user.id).all()]
    return jsonify({"quotationIds": ids})


@app.put("/api/notifications/read")
def mark_notifications_read():
    user = _current_user()
    if user is None or user.role != "cliente":
        return jsonify({"error": "Inicia sesión como comprador para actualizar tus avisos."}), 403
    payload = request.get_json(silent=True) or {}
    ids = payload.get("quotationIds") if isinstance(payload, dict) else None
    if not isinstance(ids, list) or len(ids) > 500 or any(not isinstance(item, str) for item in ids):
        return jsonify({"error": "La lista de avisos no es válida."}), 400
    owned_ids = set()
    if ids:
        owned_ids = {
            row[0] for row in db.session.query(QuotationRecord.id).filter(
                QuotationRecord.client_id == user.id,
                QuotationRecord.id.in_(set(ids)),
            ).all()
        }
    existing = set()
    if owned_ids:
        existing = {
            row.quotation_id for row in ReadNotification.query.filter(
                ReadNotification.user_id == user.id,
                ReadNotification.quotation_id.in_(owned_ids),
            ).all()
        }
    db.session.add_all(
        ReadNotification(user_id=user.id, quotation_id=quotation_id)
        for quotation_id in owned_ids - existing
    )
    db.session.commit()
    return jsonify({"quotationIds": sorted(existing | owned_ids)})


@app.get("/api/admin/users")
def admin_list_users():
    user = _current_user()
    if user is None or user.role != "admin":
        return jsonify({"error": "Se requiere una sesión de administrador."}), 403
    accounts = User.query.filter(User.role != "admin").order_by(User.registered_at.desc()).all()
    return jsonify({"users": [account.to_public_dict() for account in accounts]})


@app.patch("/api/admin/users/<string:user_id>/status")
def admin_update_user_status(user_id):
    admin = _current_user()
    if admin is None or admin.role != "admin":
        return jsonify({"error": "Se requiere una sesión de administrador."}), 403
    account = db.session.get(User, user_id)
    if account is None or account.role == "admin":
        return jsonify({"error": "No se encontró la cuenta que deseas cambiar."}), 404
    status = str((request.get_json(silent=True) or {}).get("status", ""))
    if status not in {"pendiente", "activo", "inactivo"}:
        return jsonify({"error": "El estado de la cuenta no es válido."}), 400
    account.status = status
    db.session.commit()
    return jsonify({"user": account.to_public_dict()})


@app.patch("/api/admin/users/<string:user_id>")
def admin_edit_user(user_id):
    admin = _current_user()
    if admin is None or admin.role != "admin":
        return jsonify({"error": "Se requiere una sesión de administrador."}), 403
    account = db.session.get(User, user_id)
    if account is None or account.role == "admin":
        return jsonify({"error": "No se encontró la cuenta que deseas editar."}), 404
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Los datos de la cuenta no son válidos."}), 400
    name = str(payload.get("name", account.name)).strip()
    email = str(payload.get("email", account.email)).strip().lower()
    phone = str(payload.get("phone", account.phone)).strip()
    city = str(payload.get("city", account.city)).strip()
    status = str(payload.get("status", account.status))
    if not name or len(name) > 160 or len(email) > 320 or "@" not in email or "." not in email.rsplit("@", 1)[-1]:
        return jsonify({"error": "El nombre o correo no son válidos."}), 400
    if User.query.filter(User.email == email, User.id != account.id).first():
        return jsonify({"error": "Ese correo ya está registrado."}), 409
    if phone and not 10 <= len("".join(char for char in phone if char.isdigit())) <= 13:
        return jsonify({"error": "El teléfono no es válido."}), 400
    if not city or len(city) > 100 or status not in {"pendiente", "activo", "inactivo"}:
        return jsonify({"error": "El municipio o estado de la cuenta no son válidos."}), 400
    account.name, account.email, account.phone, account.city, account.status = name, email, phone, city, status
    if account.role == "productor":
        farm_name = str(payload.get("farmName", account.farm_name)).strip()
        association = str(payload.get("association", account.association)).strip()
        products = payload.get(
            "products",
            [item.name for item in ProducerProduct.query.filter_by(user_id=account.id).order_by(ProducerProduct.id).all()],
        )
        if len(farm_name) > 160 or len(association) > 200 or not isinstance(products, list) or len(products) > 30 or any(not isinstance(item, str) or len(item) > 100 for item in products):
            return jsonify({"error": "Los datos de finca, asociación o productos no son válidos."}), 400
        account.farm_name, account.association = farm_name, association
        ProducerProduct.query.filter_by(user_id=account.id).delete()
        db.session.add_all(
            ProducerProduct(user_id=account.id, name=name)
            for name in dict.fromkeys(item.strip() for item in products if item.strip())
        )
    else:
        business_type = str(payload.get("businessType", account.business_type))
        if business_type not in {"Hogar", "Restaurante", "Distribuidor", "Importador"}:
            return jsonify({"error": "El tipo de negocio no es válido."}), 400
        account.business_type = business_type
    db.session.commit()
    return jsonify({"user": account.to_public_dict()})


@app.delete("/api/admin/users/<string:user_id>")
def admin_delete_user(user_id):
    admin = _current_user()
    if admin is None or admin.role != "admin":
        return jsonify({"error": "Se requiere una sesión de administrador."}), 403
    account = db.session.get(User, user_id)
    if account is None or account.role == "admin":
        return jsonify({"error": "No se encontró la cuenta que deseas eliminar."}), 404
    _delete_account_data(account)
    db.session.commit()
    return jsonify({"ok": True})


def _current_user():
    user_id = session.get("user_id")
    if not user_id:
        return None
    user = db.session.get(User, user_id)
    if user is None:
        session.clear()
    return user


def _user_can_access_quotation(user, quotation):
    if user is None or quotation is None:
        return False
    if user.role == "productor" and user.status != "activo":
        return False
    return user.id in {quotation.client_id, quotation.producer_id}


def _quotation_peer_id(quotation, user_id):
    return quotation.producer_id if quotation.client_id == user_id else quotation.client_id


def _quotation_peer_is_online(quotation_id, user_id):
    with _quotation_presence_lock:
        return bool(_quotation_presence.get(quotation_id, {}).get(user_id))


def _socket_is_in_quotation(sid, quotation_id):
    with _quotation_presence_lock:
        return quotation_id in _socket_quotation_ids.get(sid, set())


@socketio.on("connect")
def handle_socket_connect(auth=None):
    user = _current_user()
    if user is None or user.role not in {"cliente", "productor"}:
        return False
    if user.role == "productor" and user.status != "activo":
        return False
    join_room(f"user:{user.id}")
    with _quotation_presence_lock:
        _socket_user_ids[request.sid] = user.id
    return True


@socketio.on("disconnect")
def handle_socket_disconnect(reason=None):
    sid = request.sid
    with _quotation_presence_lock:
        user_id = _socket_user_ids.pop(sid, None)
        quotation_ids = _socket_quotation_ids.pop(sid, set())
        offline_rooms = []
        if user_id:
            for quotation_id in quotation_ids:
                participants = _quotation_presence.get(quotation_id, {})
                sockets = participants.get(user_id, set())
                sockets.discard(sid)
                if not sockets:
                    participants.pop(user_id, None)
                    offline_rooms.append(quotation_id)
                if not participants:
                    _quotation_presence.pop(quotation_id, None)
    for quotation_id in offline_rooms:
        socketio.emit(
            "quotation:presence",
            {"userId": user_id, "online": False},
            to=f"quotation:{quotation_id}",
        )


@socketio.on("quotation:join")
def handle_quotation_join(payload):
    user = _current_user()
    quotation_id = str(payload.get("quotationId", "")) if isinstance(payload, dict) else ""
    quotation = db.session.get(QuotationRecord, quotation_id)
    if not _user_can_access_quotation(user, quotation):
        return {"ok": False, "error": "No tienes permiso para consultar esta conversación."}
    room = f"quotation:{quotation.id}"
    join_room(room)
    sid = request.sid
    peer_id = _quotation_peer_id(quotation, user.id)
    with _quotation_presence_lock:
        participants = _quotation_presence.setdefault(quotation.id, {})
        participants.setdefault(user.id, set()).add(sid)
        _socket_quotation_ids.setdefault(sid, set()).add(quotation.id)
        peer_online = bool(participants.get(peer_id))

    unread_messages = QuotationMessage.query.filter(
        QuotationMessage.quotation_id == quotation.id,
        QuotationMessage.sender_id != user.id,
        QuotationMessage.read_at.is_(None),
    ).all()
    read_at = datetime.now(timezone.utc)
    for message in unread_messages:
        message.read_at = read_at
    if unread_messages:
        db.session.commit()
        socketio.emit(
            "quotation:unread",
            {"quotationId": quotation.id, "count": _unread_message_count(user.id, quotation.id)},
            to=f"user:{user.id}",
        )
        emit(
            "quotation:read",
            {
                "messageIds": [message.id for message in unread_messages],
                "readerId": user.id,
                "readAt": read_at.isoformat(),
            },
            to=room,
        )
    emit(
        "quotation:presence",
        {"userId": user.id, "online": True},
        to=room,
        include_self=False,
    )
    messages = (
        QuotationMessage.query.filter_by(quotation_id=quotation.id)
        .order_by(QuotationMessage.created_at.desc())
        .all()
    )
    return {
        "ok": True,
        "messages": [message.to_public_dict() for message in reversed(messages)],
        "participantOnline": peer_online,
    }


@socketio.on("quotation:typing")
def handle_quotation_typing(payload):
    user = _current_user()
    quotation_id = str(payload.get("quotationId", "")) if isinstance(payload, dict) else ""
    quotation = db.session.get(QuotationRecord, quotation_id)
    if not _user_can_access_quotation(user, quotation):
        return {"ok": False, "error": "No tienes permiso para participar en esta conversación."}
    if not _socket_is_in_quotation(request.sid, quotation.id):
        return {"ok": False, "error": "Únete a la conversación antes de enviar este evento."}
    emit(
        "quotation:typing",
        {"userId": user.id, "typing": bool(payload.get("typing"))},
        to=f"quotation:{quotation.id}",
        include_self=False,
    )
    return {"ok": True}


@socketio.on("quotation:send")
def handle_quotation_send(payload):
    user = _current_user()
    quotation_id = str(payload.get("quotationId", "")) if isinstance(payload, dict) else ""
    content = str(payload.get("content", "")).strip() if isinstance(payload, dict) else ""
    quotation = db.session.get(QuotationRecord, quotation_id)
    if not _user_can_access_quotation(user, quotation):
        return {"ok": False, "error": "No tienes permiso para escribir en esta conversación."}
    if not content or len(content) > 2000:
        return {"ok": False, "error": "El mensaje debe tener entre 1 y 2000 caracteres."}
    message = QuotationMessage(
        quotation_id=quotation.id,
        sender_id=user.id,
        sender_name=user.name,
        content=content,
    )
    if _quotation_peer_is_online(quotation.id, _quotation_peer_id(quotation, user.id)):
        message.read_at = datetime.now(timezone.utc)
    db.session.add(message)
    db.session.commit()
    public_message = message.to_public_dict()
    emit("quotation:message", public_message, to=f"quotation:{quotation.id}")
    peer_id = _quotation_peer_id(quotation, user.id)
    socketio.emit(
        "quotation:unread",
        {
            "quotationId": quotation.id,
            "count": _unread_message_count(peer_id, quotation.id),
        },
        to=f"user:{peer_id}",
    )
    return {"ok": True, "message": public_message}


@socketio.on("quotation:offer")
def handle_quotation_offer(payload):
    user = _current_user()
    quotation_id = str(payload.get("quotationId", "")) if isinstance(payload, dict) else ""
    quotation = (
        QuotationRecord.query.filter_by(id=quotation_id)
        .with_for_update()
        .populate_existing()
        .first()
    )
    if not _user_can_access_quotation(user, quotation):
        return {"ok": False, "error": "No tienes permiso para ofertar en esta cotización."}
    if quotation.status in {"Acordado", "Cerrado"}:
        return {"ok": False, "error": "Esta cotización ya tiene un acuerdo o está cerrada."}
    try:
        unit_price = float(payload.get("unitPriceCop", 0))
        quantity = float(payload.get("quantityKg", 0))
        freight = float(payload.get("freightCop", 0))
    except (TypeError, ValueError):
        return {"ok": False, "error": "El precio, la cantidad o el transporte no son válidos."}
    if (
        not all(math.isfinite(value) for value in (unit_price, quantity, freight))
        or unit_price <= 0
        or unit_price > 1_000_000_000
        or quantity <= 0
        or quantity > 1_000_000
        or freight < 0
        or freight > 100_000_000
    ):
        return {"ok": False, "error": "El precio, la cantidad o el transporte están fuera del rango permitido."}
    total = unit_price * quantity + freight
    if not math.isfinite(total) or total > 1_000_000_000_000:
        return {"ok": False, "error": "El valor total de la oferta supera el límite permitido."}

    pending_offer = (
        QuotationOffer.query.filter_by(quotation_id=quotation.id, status="Pendiente")
        .order_by(QuotationOffer.created_at.desc())
        .with_for_update()
        .first()
    )
    if pending_offer and pending_offer.sender_id == user.id:
        return {"ok": False, "error": "Espera a que la otra parte responda antes de enviar otra oferta."}
    reference_issue = ""
    try:
        reference, report_date, report_url = _official_price_snapshot(quotation.product_name)
    except (requests.RequestException, ValueError, OSError) as error:
        app.logger.warning("No se pudo obtener el precio SIPSA para la oferta: %s", error)
        reference = None
        report_date = ""
        report_url = DANE_SIPSA_PAGE_URL
        reference_issue = "No se pudo consultar el boletín oficial DANE-SIPSA al crear esta oferta."
    if reference is None:
        if not reference_issue:
            reference_issue = (
                f"El boletín oficial DANE-SIPSA del {report_date or 'último día publicado'} "
                f"no tiene un precio comparable para {quotation.product_name}."
            )

    now = datetime.now(timezone.utc)
    if pending_offer:
        pending_offer.status = "Contraofertada"
        pending_offer.responded_at = now
        quotation.status = "En negociación"
    elif user.role == "productor" and quotation.status == "Pendiente":
        quotation.status = "Cotizado"
    else:
        quotation.status = "En negociación"

    offer = QuotationOffer(
        quotation_id=quotation.id,
        sender_id=user.id,
        sender_name=user.name,
        unit_price_cop=unit_price,
        quantity_kg=quantity,
        freight_cop=freight,
        total_cop=total,
        reference_product=reference["productName"] if reference else quotation.product_name,
        reference_price_cop_kg=reference["meanPriceCop"] if reference else 0,
        reference_market=reference["market"] if reference else reference_issue,
        reference_date=reference["date"] if reference else report_date,
        reference_source_url=report_url or DANE_SIPSA_PAGE_URL,
    )
    db.session.add(offer)
    db.session.flush()
    message = QuotationMessage(
        quotation_id=quotation.id,
        sender_id=user.id,
        sender_name=user.name,
        content=f"Oferta: ${unit_price:,.0f}/kg por {quantity:,.0f} kg; total ${total:,.0f} COP.",
        message_type="offer",
        offer_id=offer.id,
    )
    if _quotation_peer_is_online(quotation.id, _quotation_peer_id(quotation, user.id)):
        message.read_at = datetime.now(timezone.utc)
    db.session.add(message)
    db.session.commit()

    if pending_offer:
        previous_message_id = (
            QuotationMessage.query.filter_by(offer_id=pending_offer.id)
            .order_by(QuotationMessage.created_at.desc())
            .with_entities(QuotationMessage.id)
            .scalar()
        )
        emit(
            "quotation:offer:updated",
            {
                "messageId": previous_message_id,
                "offer": pending_offer.to_public_dict(),
                "quotation": quotation.to_public_dict(),
            },
            to=f"quotation:{quotation.id}",
        )
    public_message = message.to_public_dict()
    public_quotation = quotation.to_public_dict()
    emit("quotation:message", public_message, to=f"quotation:{quotation.id}")
    peer_id = _quotation_peer_id(quotation, user.id)
    socketio.emit(
        "quotation:unread",
        {
            "quotationId": quotation.id,
            "count": _unread_message_count(peer_id, quotation.id),
        },
        to=f"user:{peer_id}",
    )
    _emit_quotation_update(public_quotation)
    return {"ok": True, "message": public_message, "quotation": public_quotation}


@socketio.on("quotation:offer:respond")
def handle_quotation_offer_response(payload):
    user = _current_user()
    offer_id = str(payload.get("offerId", "")) if isinstance(payload, dict) else ""
    action = str(payload.get("action", "")) if isinstance(payload, dict) else ""
    offer = db.session.get(QuotationOffer, offer_id)
    quotation = (
        QuotationRecord.query.filter_by(id=offer.quotation_id)
        .with_for_update()
        .populate_existing()
        .first()
        if offer
        else None
    )
    if not _user_can_access_quotation(user, quotation):
        return {"ok": False, "error": "No tienes permiso para responder esta oferta."}
    offer = (
        QuotationOffer.query.filter_by(id=offer_id, quotation_id=quotation.id)
        .with_for_update()
        .populate_existing()
        .first()
    )
    if offer is None:
        return {"ok": False, "error": "Esta oferta ya no está disponible."}
    if quotation.status in {"Acordado", "Cerrado"} or offer.status != "Pendiente":
        return {"ok": False, "error": "Esta oferta ya no está pendiente de respuesta."}
    if offer.sender_id == user.id:
        return {"ok": False, "error": "Solo la otra parte puede aceptar o rechazar esta oferta."}
    if action not in {"accept", "reject"}:
        return {"ok": False, "error": "La respuesta debe ser aceptar o rechazar."}
    offer.status = "Aceptada" if action == "accept" else "Rechazada"
    responded_at = datetime.now(timezone.utc)
    offer.responded_at = responded_at
    quotation.status = "Acordado" if action == "accept" else "En negociación"
    invalidated_offers = []
    if action == "accept":
        quotation.quantity_kg = offer.quantity_kg
        quotation.subtotal_cop = offer.unit_price_cop * offer.quantity_kg
        quotation.freight_cop = offer.freight_cop
        quotation.total_cop = offer.total_cop
        quotation.discount_percent = 0
        invalidated_offers = (
            QuotationOffer.query.filter_by(quotation_id=quotation.id, status="Pendiente")
            .with_for_update()
            .all()
        )
        for pending_offer in invalidated_offers:
            pending_offer.status = "Anulada"
            pending_offer.responded_at = responded_at
    db.session.commit()
    payload_out = {
        "messageId": (
            QuotationMessage.query.filter_by(offer_id=offer.id)
            .order_by(QuotationMessage.created_at.desc())
            .with_entities(QuotationMessage.id)
            .scalar()
        ),
        "offer": offer.to_public_dict(),
        "quotation": quotation.to_public_dict(),
    }
    emit("quotation:offer:updated", payload_out, to=f"quotation:{quotation.id}")
    for invalidated_offer in invalidated_offers:
        message_id = (
            QuotationMessage.query.filter_by(offer_id=invalidated_offer.id)
            .order_by(QuotationMessage.created_at.desc())
            .with_entities(QuotationMessage.id)
            .scalar()
        )
        emit(
            "quotation:offer:updated",
            {
                "messageId": message_id,
                "offer": invalidated_offer.to_public_dict(),
                "quotation": quotation.to_public_dict(),
            },
            to=f"quotation:{quotation.id}",
        )
    _emit_quotation_update(payload_out["quotation"])
    return {"ok": True, **payload_out}


def _emit_quotation_update(quotation_payload):
    if not quotation_payload:
        return
    for participant_id in {quotation_payload["clientId"], quotation_payload["producerId"]}:
        socketio.emit("quotation:updated", quotation_payload, to=f"user:{participant_id}")


def _user_payload(user):
    return {"user": user.to_account_dict()}


def _validate_registration(payload):
    if not isinstance(payload, dict):
        return None, "Los datos de registro no son válidos.", 400
    name = str(payload.get("name", "")).strip()
    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))
    role = str(payload.get("role", "cliente"))
    gender = str(payload.get("gender", "neutro"))
    phone = str(payload.get("phone", "")).strip()
    city = str(payload.get("city", "")).strip()
    business_type = str(payload.get("businessType", "Hogar"))
    farm_name = str(payload.get("farmName", "")).strip()
    farm_address = str(payload.get("farmAddress", "")).strip()
    association = str(payload.get("association", "")).strip()
    products = payload.get("products", [])

    if not name or len(name) > 160:
        return None, "Escribe un nombre válido.", 400
    if len(email) > 320 or "@" not in email or "." not in email.rsplit("@", 1)[-1]:
        return None, "Escribe un correo electrónico válido.", 400
    if len(password) < 8:
        return None, "La contraseña debe tener al menos 8 caracteres.", 400
    if role not in ("cliente", "productor"):
        return None, "El tipo de cuenta no es válido.", 400
    if gender not in ("masculino", "femenino", "neutro"):
        return None, "Selecciona una opción de saludo válida.", 400
    if role == "productor" and (not farm_name or not association or not isinstance(products, list) or not products):
        return None, "Completa los datos de tu finca, asociación y productos.", 400
    if len(farm_address) > 500:
        return None, "La dirección de recogida no puede superar 500 caracteres.", 400
    if not isinstance(products, list) or any(not isinstance(item, str) for item in products):
        return None, "La lista de productos no es válida.", 400

    return {
        "name": name,
        "email": email,
        "password": password,
        "role": role,
        "gender": gender,
        "phone": phone,
        "city": city or "Montería",
        "business_type": business_type,
        "farm_name": farm_name,
        "farm_address": farm_address,
        "association": association,
        "producer_products": list(dict.fromkeys(item.strip()[:100] for item in products if item.strip()))[:30],
    }, None, None


@app.post("/api/auth/register")
def register_local_user():
    payload, error, status = _validate_registration(request.get_json(silent=True) or {})
    if error:
        return jsonify({"error": error}), status
    if User.query.filter_by(email=payload["email"]).first():
        return jsonify({"error": "Ya existe una cuenta con ese correo electrónico."}), 409

    user = User(
        google_sub=f"local:{uuid.uuid4()}",
        email=payload["email"],
        name=payload["name"],
        password_hash=generate_password_hash(payload["password"]),
        role=payload["role"],
        gender=payload["gender"],
        phone=payload["phone"],
        city=payload["city"],
        business_type=payload["business_type"],
        farm_name=payload["farm_name"],
        farm_address=payload["farm_address"],
        association=payload["association"],
        status="pendiente" if payload["role"] == "productor" else "activo",
    )
    db.session.add(user)
    try:
        db.session.flush()
        db.session.add_all(
            ProducerProduct(user_id=user.id, name=product_name)
            for product_name in payload["producer_products"]
        )
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        if User.query.filter_by(email=payload["email"]).first():
            return jsonify({"error": "Ya existe una cuenta con ese correo electrónico."}), 409
        raise
    session.clear()
    session["user_id"] = user.id
    return jsonify(_user_payload(user)), 201


@app.post("/api/auth/login")
def login_local_user():
    payload = request.get_json(silent=True) or {}
    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))
    user = User.query.filter_by(email=email).first()
    if user is None or not user.password_hash or not check_password_hash(user.password_hash, password):
        return jsonify({"error": "El correo o la contraseña no son correctos."}), 401
    if user.status == "inactivo":
        return jsonify({"error": "Esta cuenta está desactivada. Contacta al administrador."}), 403
    session.clear()
    session["user_id"] = user.id
    return jsonify(_user_payload(user))


@app.patch("/api/account/password")
def update_account_password():
    user = _current_user()
    if user is None:
        return jsonify({"error": "Inicia sesión para cambiar tu contraseña."}), 401
    if user.password_hash is None:
        return jsonify({"error": "Esta cuenta usa un proveedor externo para iniciar sesión y no tiene una contraseña local."}), 400

    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Los datos para cambiar la contraseña no son válidos."}), 400
    current_password = str(payload.get("currentPassword", ""))
    new_password = str(payload.get("newPassword", ""))
    if not current_password or not check_password_hash(user.password_hash, current_password):
        return jsonify({"error": "La contraseña actual no es correcta."}), 400
    if len(new_password) < 8 or len(new_password) > 256:
        return jsonify({"error": "La nueva contraseña debe tener entre 8 y 256 caracteres."}), 400
    if check_password_hash(user.password_hash, new_password):
        return jsonify({"error": "La nueva contraseña debe ser diferente a la actual."}), 400

    user.password_hash = generate_password_hash(new_password)
    pending_reset = PasswordResetVerification.query.filter_by(user_id=user.id).first()
    if pending_reset:
        db.session.delete(pending_reset)
    db.session.commit()
    return jsonify({"ok": True, "message": "Contraseña actualizada correctamente."})


def _code_hash(code):
    secret = str(app.config["SECRET_KEY"]).encode("utf-8")
    return hmac.new(secret, code.encode("utf-8"), hashlib.sha256).hexdigest()


def _send_password_reset_code(user, code):
    _send_email_code(
        user,
        "Código para recuperar tu contraseña de AgroCórdoba",
        f"Hola {user.name},\n\nTu código para crear una nueva contraseña es: {code}\n\nVence en 10 minutos. Si no solicitaste este cambio, ignora este correo.",
    )


def _send_settings_code(user, code):
    _send_email_code(
        user,
        "Código para confirmar cambios en AgroCórdoba",
        f"Hola {user.name},\n\nTu código para confirmar los cambios de tu cuenta es: {code}\n\nVence en 10 minutos. Si no solicitaste este cambio, ignora este correo.",
    )


def _send_email_code(user, subject, content):
    sender = os.environ.get("RESEND_FROM", "").strip() or os.environ.get(
        "SMTP_FROM", ""
    ).strip()
    if not sender:
        raise RuntimeError("Email delivery sender is not configured.")

    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    if api_key:
        response = requests.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"from": sender, "to": [user.email], "subject": subject, "text": content},
            timeout=20,
        )
        response.raise_for_status()
        return

    host = os.environ.get("SMTP_HOST", "").strip()
    if not host:
        raise RuntimeError("Configure Resend or SMTP for email delivery.")
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = user.email
    message.set_content(content)
    port = int(os.environ.get("SMTP_PORT", "587"))
    username = os.environ.get("SMTP_USERNAME", "").strip()
    password = os.environ.get("SMTP_PASSWORD", "")
    use_ssl = os.environ.get("SMTP_USE_SSL", "false").lower() == "true"
    use_tls = os.environ.get("SMTP_USE_TLS", "true").lower() == "true"
    smtp_class = smtplib.SMTP_SSL if use_ssl else smtplib.SMTP
    with smtp_class(host, port, timeout=20) as smtp:
        if use_tls and not use_ssl:
            smtp.starttls()
        if username:
            smtp.login(username, password)
        smtp.send_message(message)


@app.post("/api/auth/password/request-code")
def request_password_reset_code():
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({"error": "Invalid request data."}), 400
    email = str(payload.get("email", "")).strip().lower()
    if len(email) > 320 or "@" not in email:
        return jsonify({"error": "Escribe el correo de tu cuenta."}), 400

    user = User.query.filter_by(email=email).first()
    if user is None:
        return jsonify({"ok": True, "message": "Si la cuenta existe, enviaremos un codigo."})

    now = datetime.now(timezone.utc)
    challenge = PasswordResetVerification.query.filter_by(user_id=user.id).first()
    if challenge and challenge.sent_at.replace(tzinfo=timezone.utc) > now - timedelta(seconds=60):
        return jsonify({"error": "Espera un minuto antes de pedir otro codigo."}), 429

    code = f"{secrets.randbelow(1_000_000):06d}"
    try:
        _send_password_reset_code(user, code)
    except (OSError, requests.RequestException, smtplib.SMTPException, RuntimeError, ValueError):
        app.logger.exception("Password recovery email could not be sent")
        return jsonify({"error": "No se pudo enviar el correo. Configura el proveedor de correo e inténtalo de nuevo."}), 503

    if challenge is None:
        challenge = PasswordResetVerification(user_id=user.id)
        db.session.add(challenge)
    challenge.code_hash = _code_hash(code)
    challenge.sent_at = now
    challenge.expires_at = now + timedelta(minutes=10)
    challenge.attempts = 0
    db.session.commit()
    return jsonify({"ok": True, "message": "Si la cuenta existe, enviaremos un codigo."})


@app.post("/api/auth/password/verify-code")
def reset_password_with_code():
    payload = request.get_json(silent=True) or {}
    if not isinstance(payload, dict):
        return jsonify({"error": "Invalid request data."}), 400
    email = str(payload.get("email", "")).strip().lower()
    code = str(payload.get("code", "")).strip()
    password = str(payload.get("password", ""))
    if not re.fullmatch(r"\d{6}", code):
        return jsonify({"error": "El código debe tener seis dígitos."}), 400
    if len(password) < 8 or len(password) > 256:
        return jsonify({"error": "La contrasena nueva debe tener entre 8 y 256 caracteres."}), 400

    user = User.query.filter_by(email=email).first()
    challenge = PasswordResetVerification.query.filter_by(user_id=user.id).first() if user else None
    if challenge is None:
        return jsonify({"error": "Solicita primero un codigo de recuperacion."}), 400
    if challenge.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        db.session.delete(challenge)
        db.session.commit()
        return jsonify({"error": "El codigo vencio. Solicita uno nuevo."}), 400
    if challenge.attempts >= 5:
        return jsonify({"error": "Superaste los intentos permitidos. Solicita un codigo nuevo."}), 429
    if not hmac.compare_digest(challenge.code_hash, _code_hash(code)):
        challenge.attempts += 1
        db.session.commit()
        return jsonify({"error": "El codigo no coincide."}), 400

    user.password_hash = generate_password_hash(password)
    db.session.delete(challenge)
    db.session.commit()
    return jsonify({"ok": True, "message": "Contrasena actualizada. Ya puedes iniciar sesion."})


@app.post("/api/account/settings/request-code")
def request_settings_code():
    user = _current_user()
    if user is None:
        return jsonify({"error": "Inicia sesión de nuevo para cambiar tu configuración."}), 401

    payload = request.get_json(silent=True) or {}
    changes = {}
    if "email" in payload:
        email = str(payload["email"]).strip().lower()
        if len(email) > 320 or "@" not in email or "." not in email.rsplit("@", 1)[-1]:
            return jsonify({"error": "Escribe un correo electrónico válido."}), 400
        existing = User.query.filter(User.email == email, User.id != user.id).first()
        if existing:
            return jsonify({"error": "Ese correo ya está registrado."}), 409
        changes["email"] = email
    if "name" in payload:
        name = str(payload["name"]).strip()
        if not name or len(name) > 160:
            return jsonify({"error": "El nombre debe tener entre 1 y 160 caracteres."}), 400
        changes["name"] = name
    if "phone" in payload:
        phone = str(payload["phone"]).strip()
        digits = "".join(char for char in phone if char.isdigit())
        if phone and not 10 <= len(digits) <= 13:
            return jsonify({"error": "Escribe un número de teléfono válido."}), 400
        changes["phone"] = phone
    if "notifications" in payload:
        prefs = payload["notifications"]
        fields = ("notificationsEnabled", "quoteNotifications", "responseNotifications")
        if not isinstance(prefs, dict) or any(not isinstance(prefs.get(key), bool) for key in fields):
            return jsonify({"error": "Las preferencias de notificación no son válidas."}), 400
        changes["notifications"] = prefs
    if not changes:
        return jsonify({"error": "No hay cambios para confirmar."}), 400

    now = datetime.now(timezone.utc)
    challenge = SettingsVerification.query.filter_by(user_id=user.id).first()
    if challenge and challenge.sent_at.replace(tzinfo=timezone.utc) > now - timedelta(seconds=60):
        return jsonify({"error": "Espera un minuto antes de pedir otro código."}), 429

    code = f"{secrets.randbelow(1_000_000):06d}"
    try:
        _send_settings_code(user, code)
    except (OSError, requests.RequestException, smtplib.SMTPException, RuntimeError, ValueError):
        app.logger.exception("No se pudo enviar el código de configuración")
        return jsonify({"error": "No se pudo enviar el correo. Revisa la configuración del proveedor e inténtalo de nuevo."}), 503

    if challenge is None:
        challenge = SettingsVerification(user_id=user.id)
        db.session.add(challenge)
    challenge.code_hash = _code_hash(code)
    challenge.sent_at = now
    challenge.expires_at = now + timedelta(minutes=10)
    challenge.attempts = 0
    challenge.pending_email = changes.get("email")
    challenge.pending_name = changes.get("name")
    challenge.pending_phone = changes.get("phone")
    prefs = changes.get("notifications")
    challenge.pending_notifications_enabled = (
        prefs["notificationsEnabled"] if prefs is not None else None
    )
    challenge.pending_quote_notifications = (
        prefs["quoteNotifications"] if prefs is not None else None
    )
    challenge.pending_response_notifications = (
        prefs["responseNotifications"] if prefs is not None else None
    )
    db.session.flush()
    db.session.commit()
    return jsonify({"ok": True, "email": user.email, "expiresInSeconds": 600})


@app.get("/api/account/settings")
def get_account_settings():
    user = _current_user()
    if user is None:
        return jsonify({"error": "Inicia sesión para consultar tu configuración."}), 401
    settings = AccountSettings.query.filter_by(user_id=user.id).first()
    return jsonify({
        "phone": user.phone,
        "notifications": {
            "notificationsEnabled": settings.notifications_enabled if settings else True,
            "quoteNotifications": settings.quote_notifications if settings else True,
            "responseNotifications": settings.response_notifications if settings else True,
        },
    })


@app.patch("/api/account/profile")
def update_account_profile():
    user = _current_user()
    if user is None:
        return jsonify({"error": "Inicia sesión para actualizar tu perfil."}), 401
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Los datos del perfil no son válidos."}), 400
    allowed = {"avatar", "city", "farmName", "farmAddress", "association", "businessType"}
    if not payload or set(payload) - allowed:
        return jsonify({"error": "El perfil incluye campos que no se pueden modificar aquí."}), 400
    if "avatar" in payload:
        avatar = payload["avatar"]
        if not isinstance(avatar, str) or len(avatar) > 1_500_000:
            return jsonify({"error": "La foto supera el tamaño permitido."}), 400
        if avatar and avatar.startswith("data:"):
            try:
                header, encoded = avatar.split(",", 1)
                if header not in {"data:image/jpeg;base64", "data:image/png;base64", "data:image/webp;base64"}:
                    raise ValueError("unsupported image type")
                image_bytes = base64.b64decode(encoded, validate=True)
                if not image_bytes or len(image_bytes) > 1_000_000:
                    raise ValueError("unsupported image size")
            except (ValueError, binascii.Error):
                return jsonify({"error": "La foto debe ser JPG, PNG o WebP y no superar 1 MB."}), 400
        elif avatar and not avatar.startswith("https://"):
            return jsonify({"error": "La dirección de la foto no es válida."}), 400
        user.avatar = avatar
    if "city" in payload:
        city = payload["city"]
        if not isinstance(city, str) or not city.strip() or len(city.strip()) > 100:
            return jsonify({"error": "Selecciona un municipio válido."}), 400
        user.city = city.strip()
    if "businessType" in payload:
        business_type = payload["businessType"]
        if user.role != "cliente" or business_type not in {"Hogar", "Restaurante", "Distribuidor", "Importador"}:
            return jsonify({"error": "El tipo de negocio no es válido para esta cuenta."}), 400
        user.business_type = business_type
    if "farmName" in payload or "farmAddress" in payload or "association" in payload:
        if user.role != "productor":
            return jsonify({"error": "Solo el productor puede actualizar los datos de su finca."}), 403
        farm_name = payload.get("farmName", user.farm_name)
        association = payload.get("association", user.association)
        farm_address = payload.get("farmAddress", user.farm_address)
        if not isinstance(farm_name, str) or len(farm_name.strip()) > 160:
            return jsonify({"error": "El nombre de la finca no puede superar 160 caracteres."}), 400
        if not isinstance(association, str) or len(association.strip()) > 200:
            return jsonify({"error": "La asociación no puede superar 200 caracteres."}), 400
        if not isinstance(farm_address, str) or len(farm_address.strip()) > 500:
            return jsonify({"error": "La dirección de recogida no puede superar 500 caracteres."}), 400
        user.farm_name = farm_name.strip()
        user.association = association.strip()
        user.farm_address = farm_address.strip()
    db.session.commit()
    return jsonify({"user": user.to_account_dict()})


@app.post("/api/account/settings/verify-code")
def verify_settings_code():
    user = _current_user()
    if user is None:
        return jsonify({"error": "Inicia sesión de nuevo para cambiar tu configuración."}), 401
    payload = request.get_json(silent=True) or {}
    code = str(payload.get("code", "")).strip()
    challenge = SettingsVerification.query.filter_by(user_id=user.id).first()
    if challenge is None:
        return jsonify({"error": "Solicita un código antes de confirmar."}), 400
    if challenge.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        db.session.delete(challenge)
        db.session.commit()
        return jsonify({"error": "El código venció. Solicita uno nuevo."}), 400
    if challenge.attempts >= 5:
        return jsonify({"error": "Superaste los intentos permitidos. Solicita un código nuevo."}), 429
    if not hmac.compare_digest(challenge.code_hash, _code_hash(code)):
        challenge.attempts += 1
        db.session.commit()
        return jsonify({"error": "El código no coincide."}), 400

    changes = {}
    if challenge.pending_email is not None:
        changes["email"] = challenge.pending_email
    if challenge.pending_name is not None:
        changes["name"] = challenge.pending_name
    if challenge.pending_phone is not None:
        changes["phone"] = challenge.pending_phone
    if challenge.pending_notifications_enabled is not None:
        changes["notifications"] = {
            "notificationsEnabled": challenge.pending_notifications_enabled,
            "quoteNotifications": challenge.pending_quote_notifications,
            "responseNotifications": challenge.pending_response_notifications,
        }
    if "email" in changes:
        duplicate = User.query.filter(User.email == changes["email"], User.id != user.id).first()
        if duplicate:
            db.session.delete(challenge)
            db.session.commit()
            return jsonify({"error": "Ese correo ya está registrado."}), 409
        user.email = changes["email"]
    if "name" in changes:
        user.name = changes["name"]

    settings = AccountSettings.query.filter_by(user_id=user.id).first()
    if settings is None:
        settings = AccountSettings(user_id=user.id)
        db.session.add(settings)
    if "phone" in changes:
        user.phone = changes["phone"]
    if "notifications" in changes:
        prefs = changes["notifications"]
        settings.notifications_enabled = prefs["notificationsEnabled"]
        settings.quote_notifications = prefs["quoteNotifications"]
        settings.response_notifications = prefs["responseNotifications"]

    db.session.delete(challenge)
    db.session.commit()
    return jsonify({
        "ok": True,
        "user": user.to_account_dict(),
        "notifications": {
            "notificationsEnabled": settings.notifications_enabled,
            "quoteNotifications": settings.quote_notifications,
            "responseNotifications": settings.response_notifications,
        },
    })


def frontend_url(status):
    base = os.environ.get("FRONTEND_URL")
    if not base:
        render_url = os.environ.get("RENDER_EXTERNAL_URL", "").rstrip("/")
        base = f"{render_url}/" if render_url else "http://localhost:3000/"
    return f"{base}?{urlencode({'google_login': status})}"


@app.get("/auth/google")
def google_login():
    if not os.environ.get("GOOGLE_CLIENT_ID") or not os.environ.get("GOOGLE_CLIENT_SECRET"):
        return redirect(frontend_url("setup"))

    redirect_uri = os.environ.get("GOOGLE_REDIRECT_URI")
    if not redirect_uri:
        render_url = os.environ.get("RENDER_EXTERNAL_URL", "").rstrip("/")
        redirect_uri = (
            f"{render_url}/auth/google/callback"
            if render_url
            else "http://localhost:5000/auth/google/callback"
        )
    return google.authorize_redirect(redirect_uri)


@app.get("/auth/google/callback")
def google_callback():
    try:
        token = google.authorize_access_token()
        profile = token.get("userinfo") or {}
        subject = profile.get("sub")
        email = (profile.get("email") or "").strip().lower()

        if not subject or not email or profile.get("email_verified") is not True:
            session.clear()
            return redirect(frontend_url("error"))

        user = User.query.filter_by(google_sub=subject).first()
        if user is None:
            user = User.query.filter_by(email=email).first()

        if user is None:
            user = User(
                google_sub=subject,
                email=email,
                name=(profile.get("name") or email.split("@")[0])[:160],
                avatar=profile.get("picture", ""),
            )
            db.session.add(user)
        else:
            user.google_sub = subject
            # El nombre y la foto pueden haber sido editados desde el perfil.
            # No los sobreescribimos en cada inicio de sesión con los valores de Google.

        db.session.commit()
        session.clear()
        session["user_id"] = user.id
        return redirect(frontend_url("success"))
    except Exception:
        db.session.rollback()
        session.clear()
        app.logger.exception("Falló el inicio de sesión con Google")
        return redirect(frontend_url("error"))


@app.get("/api/auth/me")
def current_user():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "No hay una sesión iniciada."}), 401

    user = db.session.get(User, user_id)
    if user is None:
        session.clear()
        return jsonify({"error": "La sesión ya no es válida."}), 401

    return jsonify({"user": user.to_account_dict()})


@app.post("/api/auth/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


def _frontend_index_content():
    dist_dir = os.environ.get("FRONTEND_DIST_DIR", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dist")))
    index_path = os.path.join(dist_dir, "index.html")
    if not os.path.isfile(index_path):
        return None
    with open(index_path, encoding="utf-8") as index_file:
        return index_file.read()


def _product_slug(name):
    normalized_name = unicodedata.normalize("NFD", name)
    ascii_name = "".join(char for char in normalized_name if not unicodedata.combining(char))
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()))


def _product_structured_data(product, product_url):
    image = product.get("image", "")
    if image and not image.startswith(("http://", "https://")):
        image = f"{request.url_root.rstrip('/')}/{image.lstrip('/')}"
    product_data = {
        "@context": "https://schema.org",
        "@type": "Product",
        "name": product["name"],
        "description": product.get("description", ""),
        "image": image,
        "sku": product["id"],
        "category": product.get("category", ""),
        "url": product_url,
        "brand": {"@type": "Brand", "name": "AgroCórdoba"},
        "offers": {
            "@type": "Offer",
            "url": product_url,
            "priceCurrency": "COP",
            "price": product["priceCopKg"],
            "priceSpecification": {
                "@type": "UnitPriceSpecification",
                "price": product["priceCopKg"],
                "priceCurrency": "COP",
                "unitCode": "KGM",
                "referenceQuantity": {
                    "@type": "QuantitativeValue",
                    "value": 1,
                    "unitCode": "KGM",
                },
            },
            "availability": (
                "https://schema.org/InStock"
                if product.get("stockAvailableKg", 0) > 0
                else "https://schema.org/OutOfStock"
            ),
            "seller": {"@type": "Person", "name": product["producerName"]},
            "areaServed": {
                "@type": "City",
                "name": product.get("municipalityName", ""),
            },
        },
    }
    return product_data


@app.get("/producto/<slug>/<string:product_id>")
def frontend_product_page(slug, product_id):
    index_html = _frontend_index_content()
    if index_html is None:
        return jsonify({"error": "El frontend todavía no está compilado."}), 404

    listing = (
        ProductListing.query.join(User, ProductListing.producer_id == User.id)
        .filter(ProductListing.id == product_id, User.status == "activo")
        .first()
    )
    if listing is None:
        return app.response_class(index_html, content_type="text/html; charset=utf-8")

    product = listing.to_public_dict()
    product_url = (
        f"{request.url_root.rstrip('/')}/producto/"
        f"{_product_slug(product['name'])}/{quote(product_id, safe='')}"
    )
    title = f"{product['name']} en {product.get('municipalityName', 'Córdoba')} | AgroCórdoba"
    description = product.get("description") or f"{product['name']} ofrecido por productores de Córdoba."
    escaped_title = html.escape(title, quote=True)
    escaped_description = html.escape(description, quote=True)
    escaped_url = html.escape(product_url, quote=True)
    image = product.get("image", "")
    if image and not image.startswith(("http://", "https://")):
        image = f"{request.url_root.rstrip('/')}/{image.lstrip('/')}"
    escaped_image = html.escape(image, quote=True)
    structured_data = json.dumps(
        _product_structured_data(product, product_url),
        ensure_ascii=False,
    ).replace("<", "\\u003c")

    replacements = (
        (r"<title>.*?</title>", f"<title>{escaped_title}</title>"),
        (
            r'<meta name="description"[^>]*>',
            f'<meta name="description" content="{escaped_description}" />',
        ),
        (
            r'<link rel="canonical"[^>]*>',
            f'<link rel="canonical" href="{escaped_url}" />',
        ),
        (
            r'<meta property="og:url"[^>]*>',
            f'<meta property="og:url" content="{escaped_url}" />',
        ),
        (
            r'<meta property="og:title"[^>]*>',
            f'<meta property="og:title" content="{escaped_title}" />',
        ),
        (
            r'<meta property="og:description"[^>]*>',
            f'<meta property="og:description" content="{escaped_description}" />',
        ),
        (
            r'<meta property="og:image"[^>]*>',
            f'<meta property="og:image" content="{escaped_image}" />',
        ),
    )
    for pattern, replacement in replacements:
        index_html = re.sub(pattern, lambda _: replacement, index_html, count=1, flags=re.IGNORECASE)

    price = f"{int(product['priceCopKg']):,}".replace(",", ".")
    server_content = (
        f'<main><article><h1>{html.escape(product["name"])}</h1>'
        f'<p>{html.escape(description)}</p>'
        f'<p>Precio de referencia: $ {price} COP por kilogramo.</p>'
        f'<p>Productor: {html.escape(product["producerName"])}. '
        f'Origen: {html.escape(product.get("municipalityName", "Córdoba"))}.</p>'
        "</article></main>"
    )
    index_html = index_html.replace('<div id="root"></div>', f'<div id="root">{server_content}</div>', 1)
    index_html = index_html.replace(
        "</head>",
        f'<script id="product-structured-data" type="application/ld+json">{structured_data}</script></head>',
        1,
    )
    return app.response_class(index_html, content_type="text/html; charset=utf-8")


@app.get("/sitemap.xml")
def frontend_sitemap():
    base_url = request.url_root.rstrip("/")
    listings = (
        ProductListing.query.join(User, ProductListing.producer_id == User.id)
        .filter(User.status == "activo")
        .order_by(ProductListing.created_at.desc())
        .all()
    )
    locations = [f"{base_url}/"]
    locations.extend(
        f"{base_url}/producto/{_product_slug(listing.name)}/{quote(listing.id, safe='')}"
        for listing in listings
    )
    sitemap = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
        + "".join(f"<url><loc>{html.escape(location)}</loc></url>" for location in locations)
        + "</urlset>"
    )
    return app.response_class(sitemap, content_type="application/xml; charset=utf-8")


@app.get("/")
def frontend_index():
    index_html = _frontend_index_content()
    if index_html is None:
        return jsonify({"error": "El frontend todavía no está compilado."}), 404
    return app.response_class(index_html, content_type="text/html; charset=utf-8")


@app.get("/<path:frontend_path>")
def frontend_assets_and_routes(frontend_path):
    if frontend_path.startswith(("api/", "auth/")):
        return jsonify({"error": "No se encontró la ruta solicitada."}), 404
    dist_dir = os.environ.get("FRONTEND_DIST_DIR", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dist")))
    requested_path = os.path.join(dist_dir, frontend_path)
    if os.path.isfile(requested_path):
        return send_from_directory(dist_dir, frontend_path)
    index_path = os.path.join(dist_dir, "index.html")
    if os.path.isfile(index_path):
        return send_from_directory(dist_dir, "index.html")
    return jsonify({"error": "El frontend todavía no está compilado."}), 404


def _migrate_user_columns():
    """Adds local-auth/profile fields to databases created by the earlier backend."""
    columns = {column["name"] for column in inspect(db.engine).get_columns("user")}
    additions = {
        "password_hash": "VARCHAR(255) NULL",
        "gender": "VARCHAR(20) NOT NULL DEFAULT 'neutro'",
        "phone": "VARCHAR(30) NOT NULL DEFAULT ''",
        "farm_name": "VARCHAR(160) NOT NULL DEFAULT ''",
        "farm_address": "VARCHAR(500) NOT NULL DEFAULT ''",
        "association": "VARCHAR(200) NOT NULL DEFAULT ''",
        "status": "VARCHAR(20) NOT NULL DEFAULT 'activo'",
    }
    for name, sql_type in additions.items():
        if name not in columns:
            db.session.execute(text(f'ALTER TABLE "user" ADD COLUMN {name} {sql_type}'))
    db.session.commit()


def _ensure_columns(table_name, additions):
    columns = {column["name"] for column in inspect(db.engine).get_columns(table_name)}
    for name, sql_type in additions.items():
        if name not in columns:
            db.session.execute(
                text(f'ALTER TABLE "{table_name}" ADD COLUMN "{name}" {sql_type}')
            )


def _drop_legacy_column(table_name, column_name):
    columns = {column["name"] for column in inspect(db.engine).get_columns(table_name)}
    if column_name in columns:
        db.session.execute(
            text(f'ALTER TABLE "{table_name}" DROP COLUMN "{column_name}"')
        )
        db.session.commit()


def _decode_legacy_object(value, table_name, row_id):
    if isinstance(value, str):
        value = json.loads(value)
    if not isinstance(value, dict):
        raise RuntimeError(
            f"Cannot migrate {table_name} row {row_id}: expected a JSON object."
        )
    return value


def _migrate_normalized_tables():
    """Moves legacy JSON and duplicate phone fields into relational columns."""
    _ensure_columns(
        "quotation_message",
        {
            "message_type": "VARCHAR(20) NOT NULL DEFAULT 'text'",
            "offer_id": "VARCHAR(36) NULL REFERENCES quotation_offer(id) ON DELETE SET NULL",
            "read_at": "TIMESTAMP NULL",
        },
    )
    user_columns = {column["name"] for column in inspect(db.engine).get_columns("user")}
    if "producer_products" in user_columns:
        rows = db.session.execute(
            text('SELECT id, producer_products FROM "user"')
        ).all()
        existing = {
            (row.user_id, row.name)
            for row in ProducerProduct.query.with_entities(
                ProducerProduct.user_id,
                ProducerProduct.name,
            ).all()
        }
        for row in rows:
            values = row.producer_products
            if isinstance(values, str):
                values = json.loads(values)
            if values is None:
                values = []
            if not isinstance(values, list) or any(not isinstance(item, str) for item in values):
                raise RuntimeError(
                    f"Cannot migrate producer products for user {row.id}: expected a string list."
                )
            for name in dict.fromkeys(item.strip() for item in values if item.strip()):
                if (row.id, name) not in existing:
                    db.session.add(ProducerProduct(user_id=row.id, name=name[:100]))
                    existing.add((row.id, name))
        db.session.commit()
        _drop_legacy_column("user", "producer_products")

    _ensure_columns(
        "product_listing",
        {
            "name": "VARCHAR(120) NOT NULL DEFAULT ''",
            "variety": "VARCHAR(120) NOT NULL DEFAULT ''",
            "category": "VARCHAR(60) NOT NULL DEFAULT ''",
            "price_cop_kg": "FLOAT NOT NULL DEFAULT 0",
            "price_usd_kg": "FLOAT NOT NULL DEFAULT 0",
            "stock_available_kg": "FLOAT NOT NULL DEFAULT 0",
            "stock_min_kg": "FLOAT NOT NULL DEFAULT 0",
            "min_order_kg": "FLOAT NOT NULL DEFAULT 0",
            "lat": "FLOAT NOT NULL DEFAULT 0",
            "lng": "FLOAT NOT NULL DEFAULT 0",
            "municipality_id": "VARCHAR(80) NOT NULL DEFAULT ''",
            "municipality_name": "VARCHAR(100) NOT NULL DEFAULT ''",
            "image": "TEXT NOT NULL DEFAULT ''",
            "harvest_season": "VARCHAR(120) NOT NULL DEFAULT ''",
            "packaging": "VARCHAR(120) NOT NULL DEFAULT ''",
            "description": "VARCHAR(2000) NOT NULL DEFAULT ''",
            "featured": "BOOLEAN NOT NULL DEFAULT FALSE",
            "producer_experience_years": "FLOAT NOT NULL DEFAULT 0",
        },
    )
    product_columns = {
        column["name"] for column in inspect(db.engine).get_columns("product_listing")
    }
    if "data" in product_columns:
        rows = db.session.execute(
            text("SELECT id, data FROM product_listing")
        ).all()
        for row in rows:
            data = _decode_legacy_object(row.data, "product_listing", row.id)
            listing = db.session.get(ProductListing, row.id)
            if listing is None:
                raise RuntimeError(f"Cannot migrate missing product listing {row.id}.")
            _apply_product_fields(listing, data)
        db.session.commit()
        _drop_legacy_column("product_listing", "data")

    quotation_additions = {
        "product_listing_id": "VARCHAR(36) NULL REFERENCES product_listing(id) ON DELETE SET NULL",
        "product_name": "VARCHAR(120) NOT NULL DEFAULT ''",
        "product_variety": "VARCHAR(120) NOT NULL DEFAULT ''",
        "producer_name": "VARCHAR(160) NOT NULL DEFAULT ''",
        "producer_association": "VARCHAR(200) NOT NULL DEFAULT ''",
        "producer_whatsapp": "VARCHAR(30) NOT NULL DEFAULT ''",
        "client_name": "VARCHAR(160) NOT NULL DEFAULT ''",
        "client_email": "VARCHAR(320) NOT NULL DEFAULT ''",
        "client_phone": "VARCHAR(30) NOT NULL DEFAULT ''",
        "client_business_type": "VARCHAR(40) NOT NULL DEFAULT ''",
        "client_city": "VARCHAR(100) NOT NULL DEFAULT ''",
        "quantity_kg": "FLOAT NOT NULL DEFAULT 0",
        "destination_zone": "VARCHAR(40) NOT NULL DEFAULT ''",
        "fulfillment_method": "VARCHAR(20) NOT NULL DEFAULT 'domicilio'",
        "delivery_address": "VARCHAR(500) NOT NULL DEFAULT ''",
        "delivery_latitude": "FLOAT NULL",
        "delivery_longitude": "FLOAT NULL",
        "payment_method": "VARCHAR(20) NOT NULL DEFAULT 'transferencia'",
        "freight_cop": "FLOAT NOT NULL DEFAULT 0",
        "subtotal_cop": "FLOAT NOT NULL DEFAULT 0",
        "total_cop": "FLOAT NOT NULL DEFAULT 0",
        "exchange_rate_cop": "FLOAT NOT NULL DEFAULT 4150",
        "discount_percent": "FLOAT NOT NULL DEFAULT 0",
        "notes": "VARCHAR(1000) NOT NULL DEFAULT ''",
    }
    _ensure_columns("quotation_record", quotation_additions)
    quotation_columns = {
        column["name"] for column in inspect(db.engine).get_columns("quotation_record")
    }
    if "data" in quotation_columns:
        rows = db.session.execute(
            text("SELECT id, product_id, data FROM quotation_record")
        ).all()
        field_map = {
            "productName": "product_name",
            "productVariety": "product_variety",
            "producerName": "producer_name",
            "producerAssociation": "producer_association",
            "producerWhatsapp": "producer_whatsapp",
            "clientName": "client_name",
            "clientEmail": "client_email",
            "clientPhone": "client_phone",
            "clientBusinessType": "client_business_type",
            "clientCity": "client_city",
            "quantityKg": "quantity_kg",
            "destinationZone": "destination_zone",
            "freightCop": "freight_cop",
            "subtotalCop": "subtotal_cop",
            "totalCop": "total_cop",
            "discountPercent": "discount_percent",
            "notes": "notes",
        }
        for row in rows:
            data = _decode_legacy_object(row.data, "quotation_record", row.id)
            values = {
                destination: data.get(source, 0 if destination in {
                    "quantity_kg",
                    "freight_cop",
                    "subtotal_cop",
                    "total_cop",
                    "discount_percent",
                } else "")
                for source, destination in field_map.items()
            }
            total_usd = float(data.get("totalUsd", 0) or 0)
            values["exchange_rate_cop"] = (
                float(values["total_cop"]) / total_usd
                if total_usd > 0
                else 4150
            )
            product = db.session.get(ProductListing, row.product_id)
            values["product_listing_id"] = product.id if product else None
            assignments = ", ".join(f'"{name}" = :{name}' for name in values)
            db.session.execute(
                text(
                    f'UPDATE quotation_record SET {assignments} WHERE id = :row_id'
                ),
                {**values, "row_id": row.id},
            )
        db.session.commit()
        _drop_legacy_column("quotation_record", "data")

    _ensure_columns(
        "settings_verification",
        {
            "pending_email": "VARCHAR(320) NULL",
            "pending_name": "VARCHAR(160) NULL",
            "pending_phone": "VARCHAR(30) NULL",
            "pending_notifications_enabled": "BOOLEAN NULL",
            "pending_quote_notifications": "BOOLEAN NULL",
            "pending_response_notifications": "BOOLEAN NULL",
        },
    )
    verification_columns = {
        column["name"] for column in inspect(db.engine).get_columns("settings_verification")
    }
    if "pending_changes" in verification_columns:
        rows = db.session.execute(
            text("SELECT id, pending_changes FROM settings_verification")
        ).all()
        for row in rows:
            changes = _decode_legacy_object(
                row.pending_changes,
                "settings_verification",
                row.id,
            )
            values = {}
            field_map = {
                "email": "pending_email",
                "name": "pending_name",
                "phone": "pending_phone",
            }
            for source, destination in field_map.items():
                if source in changes:
                    values[destination] = changes[source]
            for field_name, value in changes.items():
                if field_name == "notifications":
                    values.update({
                        "pending_notifications_enabled": value["notificationsEnabled"],
                        "pending_quote_notifications": value["quoteNotifications"],
                        "pending_response_notifications": value["responseNotifications"],
                    })
            if values:
                assignments = ", ".join(f'"{name}" = :{name}' for name in values)
                db.session.execute(
                    text(
                        f'UPDATE settings_verification SET {assignments} WHERE id = :row_id'
                    ),
                    {**values, "row_id": row.id},
                )
        db.session.commit()
        _drop_legacy_column("settings_verification", "pending_changes")

    account_settings_columns = {
        column["name"] for column in inspect(db.engine).get_columns("account_settings")
    }
    if "phone" in account_settings_columns:
        rows = db.session.execute(
            text(
                "SELECT account_settings.user_id, account_settings.phone "
                "FROM account_settings JOIN user ON user.id = account_settings.user_id "
                'WHERE user.phone = \'\' AND account_settings.phone <> \'\''
            )
        ).all()
        for row in rows:
            db.session.execute(
                text('UPDATE "user" SET phone = :phone WHERE id = :user_id'),
                {"phone": row.phone, "user_id": row.user_id},
            )
        db.session.commit()
        _drop_legacy_column("account_settings", "phone")

    db.session.commit()


with app.app_context():
    db.create_all()
    _migrate_user_columns()
    _migrate_normalized_tables()
    admin_email = os.environ.get("ADMIN_EMAIL", "").strip().lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "")
    if bool(admin_email) != bool(admin_password):
        raise RuntimeError("Configura ADMIN_EMAIL y ADMIN_PASSWORD juntos.")
    if admin_email:
        if len(admin_password) < 12:
            raise RuntimeError("ADMIN_PASSWORD debe tener al menos 12 caracteres.")
        configured_admin = User.query.filter_by(email=admin_email).first()
        if configured_admin is None:
            configured_admin = User(
                google_sub=f"local:{uuid.uuid4()}",
                email=admin_email,
                name="Administración AgroCórdoba",
                password_hash=generate_password_hash(admin_password),
                role="admin",
                status="activo",
            )
            db.session.add(configured_admin)
            db.session.commit()
        elif configured_admin.role != "admin":
            raise RuntimeError(
                "ADMIN_EMAIL pertenece a una cuenta que no es administradora."
            )


@app.cli.command("create-admin")
def create_admin_command():
    """Create a real administrator account for the SQLite-backed admin panel."""
    email = click.prompt("Correo del administrador").strip().lower()
    if len(email) > 320 or "@" not in email or "." not in email.rsplit("@", 1)[-1]:
        raise click.ClickException("Escribe un correo válido.")
    if User.query.filter_by(email=email).first():
        raise click.ClickException("Ya existe una cuenta con ese correo; no se modificó.")
    password = click.prompt("Contraseña nueva (mínimo 12 caracteres)", hide_input=True, confirmation_prompt=True)
    if len(password) < 12:
        raise click.ClickException("La contraseña del administrador debe tener al menos 12 caracteres.")
    admin = User(
        google_sub=f"local:{uuid.uuid4()}",
        email=email,
        name="Administración AgroCórdoba",
        password_hash=generate_password_hash(password),
        role="admin",
        status="activo",
    )
    db.session.add(admin)
    db.session.commit()
    click.echo("Cuenta de administrador creada. Ya puedes iniciar sesión desde el sitio.")


if __name__ == "__main__":
    socketio.run(app, host="127.0.0.1", port=5000, debug=os.environ.get("FLASK_DEBUG") == "true")

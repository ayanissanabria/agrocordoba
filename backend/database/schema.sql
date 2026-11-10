-- AgroCordoba normalized SQLite schema.
-- Generated from the SQLAlchemy models in backend/app.py.
-- product_id in quotation_record is a historical identifier; product_listing_id
-- is the nullable FK to a live listing, retained separately for quote history.
PRAGMA foreign_keys = ON;

CREATE TABLE user (
    id VARCHAR(36) NOT NULL,
    google_sub VARCHAR(255) NOT NULL,
    email VARCHAR(320) NOT NULL,
    name VARCHAR(160) NOT NULL,
    avatar TEXT NOT NULL,
    role VARCHAR(20) NOT NULL,
    city VARCHAR(100) NOT NULL,
    business_type VARCHAR(40) NOT NULL,
    registered_at DATETIME NOT NULL,
    password_hash VARCHAR(255),
    gender VARCHAR(20) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    farm_name VARCHAR(160) NOT NULL,
    farm_address VARCHAR(500) NOT NULL,
    association VARCHAR(200) NOT NULL,
    status VARCHAR(20) NOT NULL,
    PRIMARY KEY (id)
);

CREATE UNIQUE INDEX ix_user_email ON user (email);
CREATE UNIQUE INDEX ix_user_google_sub ON user (google_sub);

CREATE TABLE account_settings (
    id INTEGER NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    notifications_enabled BOOLEAN NOT NULL,
    quote_notifications BOOLEAN NOT NULL,
    response_notifications BOOLEAN NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (user_id),
    FOREIGN KEY(user_id) REFERENCES user (id)
);

CREATE TABLE favorite (
    id INTEGER NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    product_id VARCHAR(120) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_user_favorite_product UNIQUE (user_id, product_id),
    FOREIGN KEY(user_id) REFERENCES user (id)
);

CREATE INDEX ix_favorite_user_id ON favorite (user_id);

CREATE TABLE password_reset_verification (
    id INTEGER NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    code_hash VARCHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL,
    sent_at DATETIME NOT NULL,
    attempts INTEGER NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (user_id),
    FOREIGN KEY(user_id) REFERENCES user (id)
);

CREATE TABLE producer_product (
    id INTEGER NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_producer_product_name UNIQUE (user_id, name),
    FOREIGN KEY(user_id) REFERENCES user (id)
);

CREATE INDEX ix_producer_product_user_id ON producer_product (user_id);

CREATE TABLE product_listing (
    id VARCHAR(36) NOT NULL,
    producer_id VARCHAR(36) NOT NULL,
    name VARCHAR(120) NOT NULL,
    variety VARCHAR(120) NOT NULL,
    category VARCHAR(60) NOT NULL,
    price_cop_kg FLOAT NOT NULL,
    price_usd_kg FLOAT NOT NULL,
    stock_available_kg FLOAT NOT NULL,
    stock_min_kg FLOAT NOT NULL,
    min_order_kg FLOAT NOT NULL,
    lat FLOAT NOT NULL,
    lng FLOAT NOT NULL,
    municipality_id VARCHAR(80) NOT NULL,
    municipality_name VARCHAR(100) NOT NULL,
    image TEXT NOT NULL,
    harvest_season VARCHAR(120) NOT NULL,
    packaging VARCHAR(120) NOT NULL,
    description VARCHAR(2000) NOT NULL,
    featured BOOLEAN NOT NULL,
    producer_experience_years FLOAT NOT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(producer_id) REFERENCES user (id)
);

CREATE INDEX ix_product_listing_producer_id ON product_listing (producer_id);

CREATE TABLE settings_verification (
    id INTEGER NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    code_hash VARCHAR(64) NOT NULL,
    pending_email VARCHAR(320),
    pending_name VARCHAR(160),
    pending_phone VARCHAR(30),
    pending_notifications_enabled BOOLEAN,
    pending_quote_notifications BOOLEAN,
    pending_response_notifications BOOLEAN,
    expires_at DATETIME NOT NULL,
    sent_at DATETIME NOT NULL,
    attempts INTEGER NOT NULL,
    PRIMARY KEY (id),
    UNIQUE (user_id),
    FOREIGN KEY(user_id) REFERENCES user (id)
);

CREATE TABLE product_certification (
    id INTEGER NOT NULL,
    product_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_product_certification_name UNIQUE (product_id, name),
    FOREIGN KEY(product_id) REFERENCES product_listing (id)
);

CREATE INDEX ix_product_certification_product_id ON product_certification (product_id);

CREATE TABLE quotation_record (
    id VARCHAR(36) NOT NULL,
    client_id VARCHAR(36) NOT NULL,
    producer_id VARCHAR(36) NOT NULL,
    product_id VARCHAR(36) NOT NULL,
    product_listing_id VARCHAR(36),
    product_name VARCHAR(120) NOT NULL,
    product_variety VARCHAR(120) NOT NULL,
    producer_name VARCHAR(160) NOT NULL,
    producer_association VARCHAR(200) NOT NULL,
    producer_whatsapp VARCHAR(30) NOT NULL,
    client_name VARCHAR(160) NOT NULL,
    client_email VARCHAR(320) NOT NULL,
    client_phone VARCHAR(30) NOT NULL,
    client_business_type VARCHAR(40) NOT NULL,
    client_city VARCHAR(100) NOT NULL,
    quantity_kg FLOAT NOT NULL,
    destination_zone VARCHAR(40) NOT NULL,
    fulfillment_method VARCHAR(20) NOT NULL,
    delivery_address VARCHAR(500) NOT NULL,
    delivery_latitude FLOAT,
    delivery_longitude FLOAT,
    payment_method VARCHAR(20) NOT NULL,
    freight_cop FLOAT NOT NULL,
    subtotal_cop FLOAT NOT NULL,
    total_cop FLOAT NOT NULL,
    exchange_rate_cop FLOAT NOT NULL,
    discount_percent FLOAT NOT NULL,
    notes VARCHAR(1000) NOT NULL,
    status VARCHAR(30) NOT NULL,
    created_at DATETIME NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY(client_id) REFERENCES user (id),
    FOREIGN KEY(producer_id) REFERENCES user (id),
    FOREIGN KEY(product_listing_id) REFERENCES product_listing (id) ON DELETE SET NULL
);

CREATE INDEX ix_quotation_record_client_id ON quotation_record (client_id);
CREATE INDEX ix_quotation_record_producer_id ON quotation_record (producer_id);
CREATE INDEX ix_quotation_record_product_id ON quotation_record (product_id);
CREATE INDEX ix_quotation_record_product_listing_id ON quotation_record (product_listing_id);

CREATE TABLE quotation_offer (
    id VARCHAR(36) NOT NULL,
    quotation_id VARCHAR(36) NOT NULL,
    sender_id VARCHAR(36) NOT NULL,
    sender_name VARCHAR(160) NOT NULL,
    unit_price_cop FLOAT NOT NULL,
    quantity_kg FLOAT NOT NULL,
    freight_cop FLOAT NOT NULL,
    total_cop FLOAT NOT NULL,
    reference_product VARCHAR(120) NOT NULL,
    reference_price_cop_kg FLOAT NOT NULL,
    reference_market VARCHAR(160) NOT NULL,
    reference_date VARCHAR(80) NOT NULL,
    reference_source_url VARCHAR(500) NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at DATETIME NOT NULL,
    responded_at DATETIME,
    PRIMARY KEY (id),
    FOREIGN KEY(quotation_id) REFERENCES quotation_record (id) ON DELETE CASCADE,
    FOREIGN KEY(sender_id) REFERENCES user (id)
);

CREATE INDEX ix_quotation_offer_quotation_id ON quotation_offer (quotation_id);
CREATE INDEX ix_quotation_offer_sender_id ON quotation_offer (sender_id);

CREATE TABLE quotation_message (
    id VARCHAR(36) NOT NULL,
    quotation_id VARCHAR(36) NOT NULL,
    sender_id VARCHAR(36) NOT NULL,
    sender_name VARCHAR(160) NOT NULL,
    content VARCHAR(2000) NOT NULL,
    message_type VARCHAR(20) NOT NULL DEFAULT 'text',
    offer_id VARCHAR(36),
    created_at DATETIME NOT NULL,
    read_at DATETIME,
    PRIMARY KEY (id),
    FOREIGN KEY(quotation_id) REFERENCES quotation_record (id) ON DELETE CASCADE,
    FOREIGN KEY(sender_id) REFERENCES user (id),
    FOREIGN KEY(offer_id) REFERENCES quotation_offer (id) ON DELETE SET NULL
);

CREATE INDEX ix_quotation_message_quotation_id ON quotation_message (quotation_id);
CREATE INDEX ix_quotation_message_sender_id ON quotation_message (sender_id);

CREATE TABLE sipsa_price_reference (
    id INTEGER NOT NULL,
    product_key VARCHAR(120) NOT NULL,
    product_name VARCHAR(120) NOT NULL,
    market VARCHAR(160) NOT NULL,
    price_cop_kg FLOAT NOT NULL,
    report_date DATE NOT NULL,
    report_url VARCHAR(500) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_sipsa_price_reference_daily UNIQUE (product_key, market, report_date)
);

CREATE INDEX ix_sipsa_price_reference_product_date
    ON sipsa_price_reference (product_key, report_date);

CREATE TABLE read_notification (
    id INTEGER NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    quotation_id VARCHAR(36) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uq_user_read_notification UNIQUE (user_id, quotation_id),
    FOREIGN KEY(user_id) REFERENCES user (id),
    FOREIGN KEY(quotation_id) REFERENCES quotation_record (id)
);

CREATE INDEX ix_read_notification_user_id ON read_notification (user_id);

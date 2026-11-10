// ============================================================
// AGROCÓRDOBA - TIPOS DEL SISTEMA
// ============================================================

// ------------------------------------------------------------
// ROLES DE USUARIO
// ------------------------------------------------------------

export type UserRole =
  | 'cliente'
  | 'productor'
  | 'admin';

// ------------------------------------------------------------
// TIPOS DE NEGOCIO DEL COMPRADOR
// ------------------------------------------------------------

export type BusinessType =
  | 'Hogar'
  | 'Restaurante'
  | 'Distribuidor'
  | 'Importador';

// ------------------------------------------------------------
// ESTADO DE LA CUENTA
// ------------------------------------------------------------

export type UserStatus =
  | 'activo'
  | 'pendiente'
  | 'inactivo';

// ------------------------------------------------------------
// PERFIL DE USUARIO
// ------------------------------------------------------------

export interface UserProfile {
  // Identificación
  id: string;
  gender?: 'masculino' | 'femenino' | 'neutro';

  // ----------------------------------------------------------
  // INFORMACIÓN BÁSICA
  // ----------------------------------------------------------

  name: string;

  email: string;

  phone: string;

  avatar: string;

  // ----------------------------------------------------------
  // INFORMACIÓN DEL COMPRADOR
  // ----------------------------------------------------------

  businessType: BusinessType;

  city: string;

  // ----------------------------------------------------------
  // ROL DEL USUARIO
  // ----------------------------------------------------------

  role: UserRole;

  /** Proveedor usado para autenticar la cuenta, cuando ya se conoce. */
  authProvider?: 'google' | 'local';

  // ----------------------------------------------------------
  // FECHA DE REGISTRO
  // ----------------------------------------------------------

  registeredAt: string;

  // ----------------------------------------------------------
  // INFORMACIÓN DEL PRODUCTOR
  // Estos campos solamente se utilizan cuando:
  // role === 'productor'
  // ----------------------------------------------------------

  farmName?: string;

  /** Private pickup address; shown only to the buyer after an agreement. */
  farmAddress?: string;

  association?: string;

  products?: string[];

  // ----------------------------------------------------------
  // ESTADO DE LA CUENTA
  // ----------------------------------------------------------

  status?: UserStatus;
}

// ------------------------------------------------------------
// MUNICIPIOS
// ------------------------------------------------------------

export interface Municipality {
  id: string;

  name: string;

  shortDescription: string;

  subregion: string;

  lat: number;

  lng: number;

  isCapital: boolean;

  leadCrops: string[];

  climate: string;

  activeFarmersCount: number;

  availableTons: number;
}

// ------------------------------------------------------------
// CATEGORÍAS DE PRODUCTOS
// ------------------------------------------------------------

export type ProductCategory =
  | 'Cereales'
  | 'Tubérculos y Raíces'
  | 'Frutas Tropicales'
  | 'Cacao y Café'
  | 'Agroindustria y Derivados'
  | 'Otros cultivos';

// ------------------------------------------------------------
// PRODUCTOS
// ------------------------------------------------------------

export interface Product {
  // ----------------------------------------------------------
  // IDENTIFICACIÓN
  // ----------------------------------------------------------

  id: string;

  /** ID de la cuenta propietaria para publicaciones guardadas en Flask. */
  producerId?: string;

  // ----------------------------------------------------------
  // INFORMACIÓN DEL PRODUCTO
  // ----------------------------------------------------------

  name: string;

  variety: string;

  category: ProductCategory;

  // ----------------------------------------------------------
  // UBICACIÓN
  // ----------------------------------------------------------

  municipalityId: string;

  municipalityName: string;

  // ----------------------------------------------------------
  // INFORMACIÓN DEL PRODUCTOR
  // ----------------------------------------------------------

  producerName: string;

  producerAssociation: string;

  producerPhoto: string;

  producerWhatsapp: string;

  producerExperienceYears: number;

  // ----------------------------------------------------------
  // IMAGEN DEL PRODUCTO
  // ----------------------------------------------------------

  image: string;

  // ----------------------------------------------------------
  // PRECIOS
  // ----------------------------------------------------------

  priceCopKg: number;

  priceUsdKg: number;

  // ----------------------------------------------------------
  // INVENTARIO
  // ----------------------------------------------------------

  stockAvailableKg: number;

  /** Umbral definido por el productor para avisar que queda poco inventario. */
  stockMinKg?: number;

  minOrderKg: number;

  // ----------------------------------------------------------
  // COORDENADAS
  // ----------------------------------------------------------

  lat: number;

  lng: number;

  // ----------------------------------------------------------
  // INFORMACIÓN DE COSECHA
  // ----------------------------------------------------------

  harvestSeason: string;

  certifications: string[];

  packaging: string;

  description: string;

  // ----------------------------------------------------------
  // PRODUCTO DESTACADO
  // ----------------------------------------------------------

  featured?: boolean;
}

// ------------------------------------------------------------
// ESTADOS DE COTIZACIÓN
// ------------------------------------------------------------

export type QuotationStatus =
  | 'Pendiente'
  | 'Cotizado'
  | 'En negociación'
  | 'Acordado'
  | 'Contactado WhatsApp'
  | 'Listo para recoger'
  | 'Entregado'
  | 'Cerrado';

export type FulfillmentMethod = 'domicilio' | 'recoger';
export type PaymentMethod = 'efectivo' | 'transferencia';

// ------------------------------------------------------------
// ZONAS DE DESTINO
// ------------------------------------------------------------

export type DestinationZone =
  | 'Local Córdoba'
  | 'Medellín / Antioquia'
  | 'Bogotá D.C.'
  | 'Costa Caribe'
  | 'Internacional';

// ------------------------------------------------------------
// SOLICITUD DE COTIZACIÓN
// ------------------------------------------------------------

export interface QuotationRequest {
  // ----------------------------------------------------------
  // IDENTIFICACIÓN
  // ----------------------------------------------------------

  id: string;

  clientId?: string;
  producerId?: string;

  // ----------------------------------------------------------
  // INFORMACIÓN DEL PRODUCTO
  // ----------------------------------------------------------

  productId: string;

  productName: string;

  productVariety: string;

  // ----------------------------------------------------------
  // INFORMACIÓN DEL PRODUCTOR
  // ----------------------------------------------------------

  producerName: string;

  producerAssociation: string;

  producerWhatsapp: string;

  // ----------------------------------------------------------
  // INFORMACIÓN DEL CLIENTE / COMPRADOR
  // ----------------------------------------------------------

  clientName: string;

  clientEmail: string;

  clientPhone: string;

  clientBusinessType: BusinessType;

  clientCity: string;

  // ----------------------------------------------------------
  // INFORMACIÓN DE LA COMPRA
  // ----------------------------------------------------------

  quantityKg: number;

  destinationZone: DestinationZone;

  fulfillmentMethod?: FulfillmentMethod;
  deliveryAddress?: string;
  deliveryLatitude?: number | null;
  deliveryLongitude?: number | null;
  paymentMethod?: PaymentMethod;
  producerPickupAddress?: string;

  // ----------------------------------------------------------
  // VALORES DE LA COTIZACIÓN
  // ----------------------------------------------------------

  freightCop: number;

  subtotalCop: number;

  totalCop: number;

  totalUsd: number;

  discountPercent: number;

  // ----------------------------------------------------------
  // INFORMACIÓN ADICIONAL
  // ----------------------------------------------------------

  notes: string;

  // ----------------------------------------------------------
  // FECHA
  // ----------------------------------------------------------

  createdAt: string;

  // ----------------------------------------------------------
  // ESTADO
  // ----------------------------------------------------------

  status: QuotationStatus;
}

export interface QuotationMessage {
  id: string;
  quotationId: string;
  senderId: string;
  senderName: string;
  content: string;
  messageType: 'text' | 'offer';
  offer: QuotationOffer | null;
  createdAt: string;
  readAt: string | null;
}

export interface QuotationOffer {
  id: string;
  quotationId: string;
  senderId: string;
  senderName: string;
  unitPriceCop: number;
  quantityKg: number;
  freightCop: number;
  totalCop: number;
  status: 'Pendiente' | 'Contraofertada' | 'Aceptada' | 'Rechazada';
  createdAt: string;
  respondedAt: string | null;
  priceReference: {
    productName: string;
    priceCopKg: number;
    market: string;
    date: string;
    sourceUrl: string;
  } | null;
  priceReferenceUnavailable: {
    reason: string;
    date: string;
    sourceUrl: string;
  } | null;
}

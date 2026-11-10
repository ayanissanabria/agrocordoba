import React, { useMemo, useRef, useState } from 'react';

import {
  Home,
  Package,
  MessageSquareText,
  UserRound,
  LogOut,
  Plus,
  Pencil,
  Trash2,
  X,
  ImagePlus,
  Camera,
  MapPin,
  Phone,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Save,
  Settings,
} from 'lucide-react';

import { MUNICIPALITIES, USD_EXCHANGE_RATE } from '../data/mockData';
import { formatCop } from '../utils/formatters';
import { AgroCordobaBrand } from '../components/AgroCordobaBrand';
import { AccountSettings } from '../components/AccountSettings';
import { PriceReferencePanel } from '../components/PriceReferencePanel';
import { QuotationConversation } from '../components/QuotationConversation';

import {
  Product,
  ProductCategory,
  QuotationRequest,
  QuotationStatus,
  UserProfile,
} from '../types';

/* ============================================================
   PROPS
============================================================ */

interface ProducerDashboardProps {
  user: UserProfile;
  products: Product[];
  quotations: QuotationRequest[];
  onAddProduct: (product: Omit<Product, 'id'>) => Promise<void> | void;
  onUpdateProduct: (product: Product) => Promise<void> | void;
  onDeleteProduct: (id: string) => Promise<void> | void;
  onUpdateQuotationStatus: (id: string, status: QuotationStatus) => Promise<void> | void;
  onUpdateProfile: (updated: Partial<UserProfile>) => Promise<void> | void;
  onLogout: () => void;
  unreadMessageCounts?: Record<string, number>;
}

type Section = 'inicio' | 'productos' | 'cotizaciones' | 'perfil' | 'configuracion';

/* ============================================================
   CONSTANTES
============================================================ */

const CATEGORIES: ProductCategory[] = [
  'Cereales',
  'Tubérculos y Raíces',
  'Frutas Tropicales',
  'Cacao y Café',
  'Agroindustria y Derivados',
];

const STATUSES: QuotationStatus[] = [
  'Pendiente',
  'Cotizado',
  'Contactado WhatsApp',
  'En negociación',
  'Acordado',
  'Listo para recoger',
  'Entregado',
  'Cerrado',
];

const STATUS_STYLE: Record<QuotationStatus, string> = {
  Pendiente: 'bg-[#fff1e5] text-[#a14b00] border-[#f3cfae]',
  Cotizado: 'bg-[#e6f0ff] text-[#1d4f91] border-[#c4d8f5]',
  'En negociación': 'bg-[#fff1e5] text-[#a14b00] border-[#f3cfae]',
  Acordado: 'bg-[#e3f7ea] text-[#0f6b3a] border-[#b9e6c9]',
  'Contactado WhatsApp': 'bg-[#e3f7ea] text-[#0f6b3a] border-[#b9e6c9]',
  'Listo para recoger': 'bg-[#e3f7ea] text-[#0f6b3a] border-[#b9e6c9]',
  Entregado: 'bg-[#e3f7ea] text-[#0f6b3a] border-[#b9e6c9]',
  Cerrado: 'bg-[#eef1ef] text-[#59645e] border-[#d5ddd8]',
};

const FALLBACK_IMAGE = '/images/image.png';

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const findMunicipalityId = (cityName: string) => {
  const match = MUNICIPALITIES.find((m) =>
    normalize(cityName || '').startsWith(normalize(m.name))
  );
  return match ? match.id : MUNICIPALITIES[0].id;
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

const kg = (value: number) => `${value.toLocaleString('es-CO')} kg`;

const todayLabel = () =>
  new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

/* Reduce la foto antes de guardarla para no llenar el navegador */
const resizeImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagen no válido'));
      img.onload = () => {
        const maxWidth = 800;
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo procesar la imagen'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });

/* ============================================================
   FORMULARIO DE PRODUCTO
============================================================ */

interface ProductFormState {
  name: string;
  variety: string;
  category: ProductCategory;
  municipalityId: string;
  priceCopKg: string;
  stockAvailableKg: string;
  stockMinKg: string;
  minOrderKg: string;
  producerExperienceYears: string;
  harvestSeason: string;
  packaging: string;
  certifications: string;
  description: string;
  image: string;
}

const emptyForm = (user: UserProfile): ProductFormState => ({
  name: '',
  variety: '',
  category: 'Frutas Tropicales',
  municipalityId: findMunicipalityId(user.city),
  priceCopKg: '',
  stockAvailableKg: '',
  stockMinKg: '',
  minOrderKg: '100',
  producerExperienceYears: '',
  harvestSeason: '',
  packaging: '',
  certifications: '',
  description: '',
  image: '',
});

const formFromProduct = (p: Product): ProductFormState => ({
  name: p.name,
  variety: p.variety,
  category: p.category,
  municipalityId: p.municipalityId,
  priceCopKg: String(p.priceCopKg),
  stockAvailableKg: String(p.stockAvailableKg),
  stockMinKg: p.stockMinKg ? String(p.stockMinKg) : '',
  minOrderKg: String(p.minOrderKg),
  producerExperienceYears: String(p.producerExperienceYears || ''),
  harvestSeason: p.harvestSeason,
  packaging: p.packaging,
  certifications: p.certifications.join(', '),
  description: p.description,
  image: p.image,
});

const inputClass =
  'w-full rounded-lg border border-[#c9d6cd] bg-white px-3 py-2.5 text-sm text-[#151d19] placeholder:text-[#8a958e] focus:border-[#004d36] focus:outline-none focus:ring-2 focus:ring-[#b4f0cd]';

const labelClass = 'mb-1.5 block text-sm font-semibold text-[#2c3a32]';

interface ProductFormProps {
  user: UserProfile;
  editing: Product | null;
  onCancel: () => void;
  onSave: (data: Omit<Product, 'id'>) => Promise<void> | void;
}

const ProductForm: React.FC<ProductFormProps> = ({
  user,
  editing,
  onCancel,
  onSave,
}) => {
  const [form, setForm] = useState<ProductFormState>(
    editing ? formFromProduct(editing) : emptyForm(user)
  );
  const [error, setError] = useState('');
  const [loadingImage, setLoadingImage] = useState(false);

  const set = (field: keyof ProductFormState, value: string) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoadingImage(true);
    try {
      set('image', await resizeImage(file));
      setError('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingImage(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const price = Number(form.priceCopKg);
    const stock = Number(form.stockAvailableKg);
    const stockMin = Number(form.stockMinKg);
    const minOrder = Number(form.minOrderKg);

    if (!form.name.trim()) return setError('Escribe el nombre del producto.');
    if (!price || price <= 0) return setError('Escribe un precio por kilo mayor a cero.');
    if (isNaN(stock) || stock < 0) return setError('Escribe cuántos kilos tienes disponibles.');
    if (!stockMin || stockMin <= 0) return setError('Define el mínimo de kilos para recibir una alerta de stock bajo.');
    if (!minOrder || minOrder <= 0) return setError('Escribe el pedido mínimo en kilos.');

    const municipality =
      MUNICIPALITIES.find((m) => m.id === form.municipalityId) ||
      MUNICIPALITIES[0];

    try {
      await onSave({
      name: form.name.trim(),
      variety: form.variety.trim() || form.name.trim(),
      category: form.category,
      municipalityId: municipality.id,
      municipalityName: municipality.name,
      producerName: user.name,
      producerAssociation: user.association?.trim() || 'Independiente',
      producerPhoto: user.avatar || '',
      producerWhatsapp: (user.phone || '').replace(/[^0-9]/g, ''),
      producerExperienceYears: Number(form.producerExperienceYears) || 0,
      image: form.image || FALLBACK_IMAGE,
      priceCopKg: price,
      priceUsdKg: Math.round((price / USD_EXCHANGE_RATE) * 100) / 100,
      stockAvailableKg: stock,
      stockMinKg: stockMin,
      minOrderKg: minOrder,
      lat: municipality.lat,
      lng: municipality.lng,
      harvestSeason: form.harvestSeason.trim() || 'Consultar con el productor',
      certifications: form.certifications
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
      packaging: form.packaging.trim() || 'Consultar con el productor',
      description: form.description.trim(),
        featured: editing?.featured ?? false,
      });
    } catch (err) {
      setError((err as Error).message || 'No se pudo guardar el producto.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/40 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-form-title"
    >
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-[#f8fdf9] shadow-2xl sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-[#d5e3d9] bg-white px-5 py-4">
          <h2 id="product-form-title" className="text-lg font-bold text-[#003622]">
            {editing ? `Editar ${editing.name}` : 'Publicar un producto'}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-2 text-[#59645e] hover:bg-[#eef5f0] focus-visible:outline-2 focus-visible:outline-[#004d36]"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {/* FOTO */}
          <div className="flex items-center gap-4">
            <div className="h-24 w-32 shrink-0 overflow-hidden rounded-xl border border-[#d5e3d9] bg-[#e7f3ea]">
              {form.image ? (
                <img src={form.image} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[#7c9a86]">
                  <ImagePlus size={28} />
                </div>
              )}
            </div>
            <div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#004d36] bg-white px-3 py-2 text-sm font-semibold text-[#004d36] hover:bg-[#eef8f1] focus-within:ring-2 focus-within:ring-[#b4f0cd]">
                <ImagePlus size={16} />
                {loadingImage ? 'Cargando foto…' : form.image ? 'Cambiar foto' : 'Subir foto'}
                <input type="file" accept="image/*" className="sr-only" onChange={handleImage} />
              </label>
              <p className="mt-1.5 text-xs text-[#6b766f]">
                Una foto clara de la cosecha ayuda a vender más.
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="pf-name">Producto</label>
              <input id="pf-name" className={inputClass} placeholder="Ej: Plátano" value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="pf-variety">Variedad</label>
              <input id="pf-variety" className={inputClass} placeholder="Ej: Hartón" value={form.variety} onChange={(e) => set('variety', e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="pf-category">Categoría</label>
              <select id="pf-category" className={inputClass} value={form.category} onChange={(e) => set('category', e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="pf-muni">Municipio de la finca</label>
              <select id="pf-muni" className={inputClass} value={form.municipalityId} onChange={(e) => set('municipalityId', e.target.value)}>
                {MUNICIPALITIES.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>

          <fieldset className="rounded-xl border border-[#d5e3d9] bg-white p-4">
            <legend className="px-1 text-sm font-bold text-[#003622]">Precio e inventario</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="pf-price">Precio por kilo (COP)</label>
                <input id="pf-price" type="number" min="0" inputMode="numeric" className={inputClass} placeholder="2800" value={form.priceCopKg} onChange={(e) => set('priceCopKg', e.target.value)} />
              </div>
              <div>
                <label className={labelClass} htmlFor="pf-stock">Kilos disponibles</label>
                <input id="pf-stock" type="number" min="0" inputMode="numeric" className={inputClass} placeholder="5000" value={form.stockAvailableKg} onChange={(e) => set('stockAvailableKg', e.target.value)} />
              </div>
              <div>
                <label className={labelClass} htmlFor="pf-stock-min">Alerta de stock bajo (kg)</label>
                <input id="pf-stock-min" type="number" min="1" inputMode="numeric" required className={inputClass} placeholder="Ej: 500" value={form.stockMinKg} onChange={(e) => set('stockMinKg', e.target.value)} />
                <p className="mt-1 text-xs text-[#6b766f]">Te avisaremos al llegar a este nivel.</p>
              </div>
              <div>
                <label className={labelClass} htmlFor="pf-min">Pedido mínimo (kg)</label>
                <input id="pf-min" type="number" min="1" inputMode="numeric" className={inputClass} value={form.minOrderKg} onChange={(e) => set('minOrderKg', e.target.value)} />
              </div>
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="pf-season">Temporada de cosecha</label>
              <input id="pf-season" className={inputClass} placeholder="Ej: Marzo a junio" value={form.harvestSeason} onChange={(e) => set('harvestSeason', e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="pf-pack">Empaque</label>
              <input id="pf-pack" className={inputClass} placeholder="Ej: Bultos de 50 kg" value={form.packaging} onChange={(e) => set('packaging', e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="pf-cert">Certificaciones</label>
              <input id="pf-cert" className={inputClass} placeholder="Separadas por coma" value={form.certifications} onChange={(e) => set('certifications', e.target.value)} />
            </div>
            <div>
              <label className={labelClass} htmlFor="pf-exp">Años cultivándolo</label>
              <input id="pf-exp" type="number" min="0" inputMode="numeric" className={inputClass} placeholder="10" value={form.producerExperienceYears} onChange={(e) => set('producerExperienceYears', e.target.value)} />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="pf-desc">Descripción</label>
            <textarea id="pf-desc" rows={3} className={inputClass} placeholder="Cuéntale al comprador cómo es tu producto y cómo lo cultivas." value={form.description} onChange={(e) => set('description', e.target.value)} />
          </div>

          {error && (
            <p role="alert" className="flex items-center gap-2 rounded-lg bg-[#fff1e5] px-3 py-2 text-sm font-medium text-[#8a3f00]">
              <AlertTriangle size={16} /> {error}
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-[#d5e3d9] bg-white px-5 py-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2.5 text-sm font-semibold text-[#3d4a42] hover:bg-[#eef5f0]">
            Cancelar
          </button>
          <button type="submit" className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#004d36] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#003622] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004d36]">
            <Save size={16} />
            {editing ? 'Guardar cambios' : 'Publicar producto'}
          </button>
        </div>
      </form>
    </div>
  );
};

/* ============================================================
   TARJETA DE COTIZACIÓN
============================================================ */

interface QuotationCardProps {
  quotation: QuotationRequest;
  currentUserId: string;
  unreadCount: number;
  onChangeStatus: (status: QuotationStatus) => void;
}

const QuotationCard: React.FC<QuotationCardProps> = ({
  quotation: q,
  currentUserId,
  unreadCount,
  onChangeStatus,
}) => {
  const displayStatus = q.status === 'Contactado WhatsApp' ? 'En negociación' : q.status;

  return (
    <article className="rounded-2xl border border-[#e2e7df] bg-white p-5 shadow-[0_2px_10px_rgba(24,36,29,0.035)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-[#151d19]">
            {q.productName}
            <span className="ml-2 font-medium text-[#59645e]">{kg(q.quantityKg)}</span>
          </h3>
          <p className="mt-0.5 text-sm text-[#59645e]">
            {q.clientName} ({q.clientBusinessType}), {q.clientCity || q.destinationZone}
          </p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${STATUS_STYLE[displayStatus]}`}>
          {displayStatus}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-[#6b766f]">Valor total</dt>
          <dd className="font-bold text-[#003622]">{formatCop(q.totalCop)}</dd>
        </div>
        <div>
          <dt className="text-[#6b766f]">Destino</dt>
          <dd className="font-semibold text-[#2c3a32]">{q.destinationZone}</dd>
        </div>
        <div>
          <dt className="text-[#6b766f]">Descuento</dt>
          <dd className="font-semibold text-[#2c3a32]">{q.discountPercent}%</dd>
        </div>
        <div>
          <dt className="text-[#6b766f]">Recibida</dt>
          <dd className="font-semibold text-[#2c3a32]">{q.createdAt}</dd>
        </div>
      </dl>

      {q.notes && (
        <p className="mt-3 rounded-lg bg-[#f4faf6] px-3 py-2 text-sm text-[#3d4a42]">
          “{q.notes}”
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        {unreadCount > 0 && (
          <span role="status" className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800">
            {unreadCount} {unreadCount === 1 ? 'mensaje pendiente' : 'mensajes pendientes'}
          </span>
        )}
        {q.clientId && q.producerId && (
          <QuotationConversation quotationId={q.id} currentUserId={currentUserId} participantName={q.clientName} productName={q.productName} quotationStatus={q.status} initialUnitPrice={q.quantityKg > 0 ? q.subtotalCop / q.quantityKg : 0} initialQuantityKg={q.quantityKg} initialFreightCop={q.freightCop} fulfillmentMethod={q.fulfillmentMethod} paymentMethod={q.paymentMethod} deliveryAddress={q.deliveryAddress} deliveryLatitude={q.deliveryLatitude} deliveryLongitude={q.deliveryLongitude} producerPickupAddress={q.producerPickupAddress} />
        )}
        {q.status === 'Acordado' ? (
          <button
            type="button"
            onClick={() => onChangeStatus(q.fulfillmentMethod === 'recoger' ? 'Listo para recoger' : 'Entregado')}
            className="rounded-lg bg-[#004d36] px-3 py-2 text-sm font-bold text-white hover:bg-[#003622] sm:ml-auto"
          >
            {q.fulfillmentMethod === 'recoger' ? 'Marcar listo para recoger' : 'Confirmar entrega al comprador'}
          </button>
        ) : q.status === 'En negociación' || q.status === 'Contactado WhatsApp' ? (
          <span className="text-sm font-semibold text-[#59645e] sm:ml-auto">
            Negocia la oferta en la conversación; al aceptarla el pedido quedará acordado.
          </span>
        ) : q.status === 'Entregado' || q.status === 'Listo para recoger' ? (
          <span className="rounded-lg border border-[#c9d6cd] bg-[#f6f7f3] px-3 py-2 text-sm font-semibold text-[#2c3a32] sm:ml-auto">
            {q.status === 'Entregado' ? 'Entrega registrada' : 'Pedido listo para recoger'} · esperando confirmación del comprador
          </span>
        ) : q.status === 'Cerrado' ? (
          <span className="rounded-lg border border-[#c9d6cd] bg-[#f6f7f3] px-3 py-2 text-sm font-semibold text-[#2c3a32] sm:ml-auto">
            Venta cerrada: recepción confirmada por el comprador.
          </span>
        ) : (
          <label className="flex items-center gap-2 text-sm text-[#59645e] sm:ml-auto">
            Estado
            <select
              value={q.status}
              onChange={(e) => onChangeStatus(e.target.value as QuotationStatus)}
              className="rounded-lg border border-[#c9d6cd] bg-white px-2.5 py-2 text-sm font-semibold text-[#2c3a32] focus:border-[#004d36] focus:outline-none focus:ring-2 focus:ring-[#b4f0cd]"
            >
              {STATUSES.filter((status) => ['Pendiente', 'Cotizado', 'Contactado WhatsApp'].includes(status)).map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>
        )}
      </div>
    </article>
  );
};

/* ============================================================
   PANEL PRINCIPAL
============================================================ */

export const ProducerDashboard: React.FC<ProducerDashboardProps> = ({
  user,
  products,
  quotations,
  unreadMessageCounts = {},
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  onUpdateQuotationStatus,
  onUpdateProfile,
  onLogout,
}) => {
  const [section, setSection] = useState<Section>('inicio');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [statusFilter, setStatusFilter] = useState<QuotationStatus | 'Todas'>('Todas');
  const [notice, setNotice] = useState('');

  /* ---------- Datos del productor ---------- */

  const myProducts = useMemo(
    () => products.filter((p) => p.producerId
      ? p.producerId === user.id
      : !user.authProvider && p.producerName === user.name),
    [products, user.id, user.name, user.authProvider]
  );

  const myQuotations = useMemo(() => {
    const ids = new Set(myProducts.map((p) => p.id));
    return quotations.filter(
      (q) => q.producerId
        ? q.producerId === user.id
        : !user.authProvider && (ids.has(q.productId) || q.producerName === user.name)
    );
  }, [quotations, myProducts, user.id, user.name, user.authProvider]);

  const pending = myQuotations.filter((q) => q.status === 'Pendiente');
  const unreadMessageCount = myQuotations.reduce(
    (total, quotation) => total + (unreadMessageCounts[quotation.id] || 0),
    0
  );

  const requestedKgByProduct = useMemo(() => {
    const map: Record<string, number> = {};
    myQuotations
      .filter((q) => q.status !== 'Cerrado')
      .forEach((q) => {
        map[q.productId] = (map[q.productId] || 0) + q.quantityKg;
      });
    return map;
  }, [myQuotations]);

  const totalStock = myProducts.reduce((t, p) => t + p.stockAvailableKg, 0);
  const lowStockProducts = myProducts.filter(
    (product) => typeof product.stockMinKg === 'number' && product.stockMinKg > 0 && product.stockAvailableKg <= product.stockMinKg
  );
  const stockThresholdMissing = myProducts.filter(
    (product) => typeof product.stockMinKg !== 'number' || product.stockMinKg <= 0
  );

  const showNotice = (text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(''), 3000);
  };

  /* ---------- Acciones ---------- */

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    setFormOpen(true);
  };

  const handleSaveProduct = async (data: Omit<Product, 'id'>) => {
    if (editing) {
      await onUpdateProduct({ ...data, id: editing.id });
      showNotice('Cambios guardados.');
    } else {
      await onAddProduct(data);
      showNotice('Producto publicado. Ya aparece en el catálogo.');
    }
    setFormOpen(false);
    setEditing(null);
    setSection('productos');
  };

  const handleDelete = (product: Product) => {
    if (window.confirm(`¿Eliminar ${product.name} del catálogo? Esta acción no se puede deshacer.`)) {
      void Promise.resolve(onDeleteProduct(product.id))
        .then(() => showNotice('Producto eliminado.'))
        .catch((error: Error) => showNotice(error.message || 'No se pudo eliminar el producto.'));
    }
  };

  /* ---------- Perfil ---------- */

  const [profile, setProfile] = useState({
    name: user.name,
    phone: user.phone,
    farmName: user.farmName || '',
    farmAddress: user.farmAddress || '',
    association: user.association || '',
    city: user.city,
  });
  const profilePhotoRef = useRef<HTMLInputElement | null>(null);

  const handleProducerPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return showNotice('Selecciona una imagen JPG o PNG.');
    if (file.size > 10 * 1024 * 1024) return showNotice('La imagen no puede superar los 10 MB.');
    try {
      const avatar = await resizeImage(file);
      await onUpdateProfile({ avatar });
      await Promise.all(myProducts.map((product) => onUpdateProduct({ ...product, producerPhoto: avatar })));
      showNotice('Foto de perfil actualizada.');
    } catch (error) {
      showNotice((error as Error).message);
    }
  };

  const deleteProducerPhoto = async () => {
    if (!window.confirm('¿Eliminar tu foto de perfil?')) return;
    try {
      await onUpdateProfile({ avatar: '' });
      await Promise.all(myProducts.map((product) => onUpdateProduct({ ...product, producerPhoto: '' })));
      showNotice('Foto de perfil eliminada.');
    } catch (error) {
      showNotice((error as Error).message || 'No se pudo eliminar la foto.');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile.name.trim() || !profile.phone.trim()) {
      showNotice('El nombre y el teléfono son obligatorios.');
      return;
    }

    const updated = {
      name: profile.name.trim(),
      phone: profile.phone.trim(),
      farmName: profile.farmName.trim(),
      farmAddress: profile.farmAddress.trim(),
      association: profile.association.trim(),
      city: profile.city,
    };

    // Los productos publicados muestran los datos del productor
    try {
      await Promise.all(myProducts.map((p) =>
        onUpdateProduct({
        ...p,
        producerName: updated.name,
        producerAssociation: updated.association || 'Independiente',
        producerWhatsapp: updated.phone.replace(/[^0-9]/g, ''),
        })
      ));
      await onUpdateProfile(updated);
      showNotice('Perfil actualizado.');
    } catch (error) {
      showNotice((error as Error).message || 'No se pudo guardar el perfil.');
    }
  };

  /* ---------- Navegación ---------- */

  const tabs: { id: Section; label: string; icon: React.ReactNode; badge?: number; unreadBadge?: number }[] = [
    { id: 'inicio', label: 'Inicio', icon: <Home size={18} /> },
    { id: 'productos', label: 'Mis productos', icon: <Package size={18} />, badge: myProducts.length },
    { id: 'cotizaciones', label: 'Cotizaciones', icon: <MessageSquareText size={18} />, badge: pending.length, unreadBadge: unreadMessageCount },
    { id: 'perfil', label: 'Mi perfil', icon: <UserRound size={18} /> },
    { id: 'configuracion', label: 'Configuración', icon: <Settings size={18} /> },
  ];

  const filteredQuotations =
    statusFilter === 'Todas'
      ? myQuotations
      : myQuotations.filter((q) => q.status === statusFilter || (statusFilter === 'En negociación' && q.status === 'Contactado WhatsApp'));

  /* ---------- Lista de productos (se usa en Inicio y Mis productos) ---------- */

  const renderProductRow = (p: Product) => {
    const requested = requestedKgByProduct[p.id] || 0;
    const coverage = p.stockAvailableKg > 0
      ? Math.min(100, Math.round((requested / p.stockAvailableKg) * 100))
      : requested > 0 ? 100 : 0;
    const short = requested > p.stockAvailableKg;

    return (
    <li key={p.id} className={`flex flex-col gap-4 rounded-2xl border bg-white p-4 shadow-[0_2px_10px_rgba(24,36,29,0.035)] sm:flex-row sm:items-center sm:p-5 ${lowStockProducts.some((product) => product.id === p.id) ? 'border-red-300' : 'border-[#e2e7df]'}`}>
        <img
          src={p.image || FALLBACK_IMAGE}
          alt=""
          className="h-20 w-full rounded-lg object-cover sm:w-28"
          onError={(e) => {
            e.currentTarget.src = FALLBACK_IMAGE;
          }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <h3 className="text-base font-bold text-[#151d19]">{p.name}</h3>
            <span className="text-sm text-[#59645e]">{p.variety}</span>
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-sm text-[#59645e]">
            <MapPin size={14} /> {p.municipalityName}
            <span className="mx-1 text-[#c0c9c1]">|</span>
            <span className="font-semibold text-[#003622]">{formatCop(p.priceCopKg)}/kg</span>
          </p>

          <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
            {lowStockProducts.some((product) => product.id === p.id) ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-red-800">
                <AlertTriangle size={13} aria-hidden="true" /> Stock bajo · mínimo {kg(p.stockMinKg || 0)}
              </span>
            ) : typeof p.stockMinKg === 'number' && p.stockMinKg > 0 ? (
              <span className="rounded-full bg-[#edf5ef] px-2.5 py-1 text-[#285b3c]">Mínimo de alerta: {kg(p.stockMinKg)}</span>
            ) : (
              <span className="rounded-full bg-[#fff5e9] px-2.5 py-1 text-[#8a4c12]">Falta configurar el mínimo de stock</span>
            )}
          </div>

          {/* Barra de inventario: disponible frente a lo que piden */}
          <div className="mt-3 max-w-md">
            <div
              className="h-2.5 overflow-hidden rounded-full bg-[#dcebe1]"
              role="img"
              aria-label={`${kg(requested)} pedidos de ${kg(p.stockAvailableKg)} disponibles`}
            >
              <div
                className={`h-full rounded-full ${short ? 'bg-[#a14b00]' : 'bg-[#2f8f5b]'}`}
                style={{ width: `${coverage}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-[#59645e]">
              <span className="font-semibold text-[#2c3a32]">{kg(p.stockAvailableKg)}</span> disponibles,{' '}
              <span className={short ? 'font-bold text-[#a14b00]' : 'font-semibold text-[#2c3a32]'}>
                {kg(requested)}
              </span>{' '}
              en cotizaciones abiertas
              {short && ' (no te alcanza)'}
            </p>
          </div>
        </div>
        <div className="flex gap-2 sm:flex-col">
          <button
            type="button"
            onClick={() => openEdit(p)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[#c9d6cd] bg-white px-3 py-2 text-sm font-semibold text-[#2c3a32] hover:border-[#004d36] hover:text-[#004d36]"
          >
            <Pencil size={15} /> Editar
          </button>
          <button
            type="button"
            onClick={() => handleDelete(p)}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-transparent px-3 py-2 text-sm font-semibold text-[#9b3b1c] hover:bg-[#fdeee8]"
          >
            <Trash2 size={15} /> Eliminar
          </button>
        </div>
      </li>
    );
  };

  /* ============================================================
     INTERFAZ
  ============================================================ */

  return (
    <div className="min-h-screen bg-[#f6f7f3] text-[#18241d]">
      {/* ENCABEZADO */}
      <header className="sticky top-0 z-30 border-b border-[#e2e7df] bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <AgroCordobaBrand compact subtitle="Panel del productor" />
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setSection('perfil')} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-left transition hover:bg-[#f6f7f3]" aria-label="Abrir mi perfil">
              <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-[#e2e7df] bg-[#edf3ed] text-sm font-bold text-[#1f4d36]">
                {user.avatar
                  ? <img src={user.avatar} alt="" className="h-full w-full object-cover" />
                  : firstName(user.name).slice(0, 1).toUpperCase()}
              </span>
              <span className="hidden text-right leading-tight sm:block">
                <span className="block text-sm font-semibold text-[#151d19]">{user.name}</span>
                <span className="block text-xs text-[#59645e]">{user.farmName || user.city}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#c9d6cd] px-3 py-2 text-sm font-semibold text-[#3d4a42] hover:bg-[#f2fcf4] focus-visible:outline-2 focus-visible:outline-[#004d36]"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        </div>

        {/* PESTAÑAS */}
        <nav className="mx-auto max-w-6xl overflow-x-auto px-3 sm:px-6" aria-label="Secciones del panel">
          <ul className="flex min-w-max gap-2">
            {tabs.map((tab) => {
              const active = section === tab.id;
              return (
                <li key={tab.id}>
                  <button
                    type="button"
                    onClick={() => setSection(tab.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`my-1 flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[#004d36] ${
                      active ? 'bg-[#edf3ed] text-[#1f4d36]' : 'text-[#6b766f] hover:bg-[#f6f7f3] hover:text-[#2c3a32]'
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                    {!!tab.badge && (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                          tab.id === 'cotizaciones'
                            ? 'bg-[#a14b00] text-white'
                            : 'bg-[#dcebe1] text-[#2c3a32]'
                        }`}
                      >
                        {tab.badge}
                      </span>
                    )}
                    {!!tab.unreadBadge && (
                      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-800">
                        {tab.unreadBadge}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-9">
        {notice && (
          <div
            role="status"
            className="mb-6 flex items-center gap-2 rounded-xl border border-[#b9e6c9] bg-[#eaf5ec] px-4 py-3 text-sm font-semibold text-[#0f6b3a]"
          >
            <CheckCircle2 size={18} /> {notice}
          </div>
        )}

        {user.status === 'pendiente' && (
          <div className="mb-6 flex gap-3 rounded-xl border border-[#f3cfae] bg-[#fff6ee] px-4 py-3 text-sm text-[#7a3a00]">
            <Clock size={18} className="mt-0.5 shrink-0" />
            <p>
              <strong>Tu cuenta está en revisión.</strong> El equipo de AgroCórdoba
              validará tus datos. Mientras tanto ya puedes publicar y administrar tus productos.
            </p>
          </div>
        )}

        {/* ===================== INICIO ===================== */}
        {section === 'inicio' && (
          <div className="space-y-7">
            <section className="flex flex-col justify-between gap-5 rounded-3xl bg-[#173b2b] px-6 py-7 text-white shadow-[0_12px_32px_rgba(23,59,43,0.12)] sm:flex-row sm:items-end sm:px-8 sm:py-8">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#e7bd5e]">{todayLabel()}</p>
                <h1 className="mt-2 font-editorial text-3xl font-semibold leading-tight sm:text-4xl">{user.gender === 'femenino' ? '¡Bienvenida' : user.gender === 'masculino' ? '¡Bienvenido' : '¡Te damos la bienvenida'}, {firstName(user.name)}!</h1>
                <p className="mt-2 text-sm text-[#d9e4da]">
                  {pending.length > 0
                    ? `Tienes ${pending.length} ${pending.length === 1 ? 'cotización' : 'cotizaciones'} esperando respuesta.`
                    : 'Tu actividad y tus cosechas, en un solo lugar.'}
                </p>
              </div>
              {pending.length > 0 && (
                <button type="button" onClick={() => setSection('cotizaciones')} className="inline-flex items-center justify-center gap-2 self-start rounded-full bg-[#e3a72f] px-4 py-2.5 text-sm font-bold text-[#2b1f05] transition hover:bg-[#f0bc4d] sm:self-auto">
                  <MessageSquareText size={17} /> Revisar cotizaciones
                </button>
              )}
            </section>

            {/* Resumen en una franja */}
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-[#e2e7df] bg-white p-5 shadow-[0_2px_10px_rgba(24,36,29,0.035)] sm:p-6">
                <dt className="text-[13px] font-medium text-[#5b665f]">Productos publicados</dt>
                <dd className="mt-3 font-editorial text-3xl font-semibold text-[#1f4d36]">{myProducts.length}</dd>
              </div>
              <div className="rounded-2xl border border-[#e2e7df] bg-white p-5 shadow-[0_2px_10px_rgba(24,36,29,0.035)] sm:p-6">
                <dt className="text-[13px] font-medium text-[#5b665f]">Cosecha disponible</dt>
                <dd className="mt-3 font-editorial text-3xl font-semibold text-[#1f4d36]">{kg(totalStock)}</dd>
              </div>
              <div className="rounded-2xl border border-[#e2e7df] bg-white p-5 shadow-[0_2px_10px_rgba(24,36,29,0.035)] sm:p-6">
                <dt className="text-[13px] font-medium text-[#5b665f]">Cotizaciones pendientes</dt>
                <dd className="mt-3 font-editorial text-3xl font-semibold text-[#1f4d36]">{pending.length}</dd>
              </div>
              <div className="rounded-2xl border border-[#e2e7df] bg-white p-5 shadow-[0_2px_10px_rgba(24,36,29,0.035)] sm:p-6">
                <dt className="text-[13px] font-medium text-[#5b665f]">Mensajes sin leer</dt>
                <dd className="mt-3 font-editorial text-3xl font-semibold text-[#1f4d36]">{unreadMessageCount}</dd>
              </div>
            </dl>

            <PriceReferencePanel productNames={myProducts.map((product) => product.name)} />

            <section aria-labelledby="stock-alerts-title" className="rounded-2xl border bg-white p-5 shadow-[0_2px_10px_rgba(24,36,29,0.035)] sm:p-6">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#6b766f]">Inventario</p>
                  <h2 id="stock-alerts-title" className="mt-1 font-editorial text-2xl font-semibold text-[#173b2b]">Estado de tus cosechas</h2>
                </div>
                <button type="button" onClick={() => setSection('productos')} className="inline-flex items-center justify-center gap-2 self-start rounded-lg border border-[#c9d6cd] px-4 py-2 text-sm font-semibold text-[#1f4d36] hover:bg-[#f2f7f2] sm:self-auto">
                  <Package size={16} /> Gestionar inventario
                </button>
              </div>

              {lowStockProducts.length > 0 ? (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4" role="alert">
                  <p className="flex items-center gap-2 font-bold text-red-900">
                    <AlertTriangle size={18} aria-hidden="true" /> {lowStockProducts.length === 1 ? 'Una cosecha necesita atención' : `${lowStockProducts.length} cosechas necesitan atención`}
                  </p>
                  <ul className="mt-2 divide-y divide-red-200">
                    {lowStockProducts.map((product) => (
                      <li key={product.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm text-red-900">
                        <span><strong>{product.name}</strong>: {kg(product.stockAvailableKg)} disponibles · mínimo {kg(product.stockMinKg || 0)}</span>
                        <button type="button" onClick={() => openEdit(product)} className="font-bold underline underline-offset-2 hover:text-red-700">Actualizar stock</button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : stockThresholdMissing.length > 0 ? (
                <div className="mt-4 flex flex-col justify-between gap-3 rounded-xl border border-[#f0d6b8] bg-[#fff8ef] p-4 sm:flex-row sm:items-center">
                  <p className="text-sm leading-6 text-[#70430d]">
                    Configura un mínimo de alerta para {stockThresholdMissing.length === 1 ? 'tu producto' : `${stockThresholdMissing.length} productos`} y te avisaremos cuando la cosecha esté por agotarse.
                  </p>
                  <button type="button" onClick={() => openEdit(stockThresholdMissing[0])} className="shrink-0 text-sm font-bold text-[#70430d] underline underline-offset-2">Configurar primer mínimo</button>
                </div>
              ) : myProducts.length > 0 ? (
                <p className="mt-4 rounded-xl bg-[#edf5ef] px-4 py-3 text-sm font-medium text-[#285b3c]">No hay alertas: todos tus productos están por encima del mínimo configurado.</p>
              ) : (
                <p className="mt-4 rounded-xl bg-[#f6f7f3] px-4 py-3 text-sm text-[#59645e]">Publica un producto para empezar a controlar tu inventario.</p>
              )}
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-editorial text-xl font-semibold text-[#173b2b]">Por responder</h2>
                {myQuotations.length > 0 && (
                  <button type="button" onClick={() => setSection('cotizaciones')} className="text-sm font-semibold text-[#004d36] hover:underline">
                    Ver todas
                  </button>
                )}
              </div>
              {pending.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[#c0d3c6] bg-white px-5 py-6 text-sm text-[#59645e]">
                  Cuando un comprador pida una cotización de tus productos, aparecerá aquí.
                </p>
              ) : (
                <div className="space-y-3">
                  {pending.slice(0, 3).map((q) => (
                    <QuotationCard
                      key={q.id}
                      quotation={q}
                      currentUserId={user.id}
                      unreadCount={unreadMessageCounts[q.id] || 0}
                      onChangeStatus={(s) => void Promise.resolve(onUpdateQuotationStatus(q.id, s)).catch((error: Error) => showNotice(error.message || 'No se pudo actualizar la cotización.'))}
                    />
                  ))}
                </div>
              )}
            </section>

            <section>
              <div className="mb-1 flex items-center justify-between">
                <h2 className="font-editorial text-xl font-semibold text-[#173b2b]">Tu inventario</h2>
                <button type="button" onClick={openNew} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#004d36] hover:underline">
                  <Plus size={16} /> Publicar producto
                </button>
              </div>
              {myProducts.length === 0 ? (
                <p className="mt-2 rounded-xl border border-dashed border-[#c0d3c6] bg-white px-5 py-6 text-sm text-[#59645e]">
                  Aún no tienes productos publicados. Publica tu primera cosecha para que los compradores la encuentren.
                </p>
              ) : (
                <ul className="space-y-3">
                  {myProducts.slice(0, 3).map(renderProductRow)}
                </ul>
              )}
            </section>
          </div>
        )}

        {/* ===================== MIS PRODUCTOS ===================== */}
        {section === 'productos' && (
          <div>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="font-editorial text-3xl font-semibold text-[#173b2b]">Mis productos</h1>
                <p className="mt-1 text-sm text-[#59645e]">
                  Lo que publiques aquí aparece en el catálogo para los compradores.
                </p>
              </div>
              <button
                type="button"
                onClick={openNew}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#004d36] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#003622] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004d36]"
              >
                <Plus size={18} /> Publicar producto
              </button>
            </div>

            {myProducts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#c0d3c6] bg-white px-6 py-10 text-center">
                <Package size={32} className="mx-auto text-[#7c9a86]" />
                <p className="mt-3 font-semibold text-[#2c3a32]">Todavía no has publicado productos</p>
                <p className="mt-1 text-sm text-[#59645e]">Empieza con lo que tengas cosechado ahora.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {myProducts.map(renderProductRow)}
              </ul>
            )}
          </div>
        )}

        {/* ===================== COTIZACIONES ===================== */}
        {section === 'cotizaciones' && (
          <div>
            <h1 className="font-editorial text-3xl font-semibold text-[#173b2b]">Cotizaciones recibidas</h1>
            <p className="mt-1 text-sm text-[#59645e]">
              Negocia en la conversación de AgroCórdoba y actualiza el estado para llevar el control de tus ventas.
            </p>

            <div className="mt-5 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filtrar por estado">
              {(['Todas', ...STATUSES] as const).map((s) => {
                const count = s === 'Todas'
                  ? myQuotations.length
                  : myQuotations.filter((q) => q.status === s || (s === 'En negociación' && q.status === 'Contactado WhatsApp')).length;
                const active = statusFilter === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatusFilter(s)}
                    aria-pressed={active}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-semibold ${
                      active
                        ? 'border-[#004d36] bg-[#004d36] text-white'
                        : 'border-[#c9d6cd] bg-white text-[#3d4a42] hover:border-[#004d36]'
                    }`}
                  >
                    {s} ({count})
                  </button>
                );
              })}
            </div>

            <div className="mt-5 space-y-3">
              {filteredQuotations.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[#c0d3c6] bg-white px-5 py-6 text-sm text-[#59645e]">
                  No hay cotizaciones con este estado.
                </p>
              ) : (
                filteredQuotations.map((q) => (
                  <QuotationCard
                    key={q.id}
                    quotation={q}
                    currentUserId={user.id}
                    unreadCount={unreadMessageCounts[q.id] || 0}
                    onChangeStatus={(s) => void Promise.resolve(onUpdateQuotationStatus(q.id, s)).catch((error: Error) => showNotice(error.message || 'No se pudo actualizar la cotización.'))}
                  />
                ))
              )}
            </div>
          </div>
        )}

        {/* ===================== PERFIL ===================== */}
        {section === 'perfil' && (
          <form onSubmit={handleSaveProfile} className="max-w-2xl">
            <h1 className="font-editorial text-3xl font-semibold text-[#173b2b]">Mi perfil</h1>
            <p className="mt-1 text-sm text-[#59645e]">
              Tu nombre, asociación y teléfono aparecen en tus productos; la dirección exacta solo se comparte en pedidos acordados para recoger.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-4 rounded-2xl border border-[#e2e7df] bg-white p-5 shadow-[0_2px_10px_rgba(24,36,29,0.035)]">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-[#e2e7df] bg-[#edf3ed] text-[#1f4d36]">
                {user.avatar
                  ? <img src={user.avatar} alt={`Foto de ${user.name}`} className="h-full w-full object-cover" />
                  : <UserRound size={32} aria-hidden="true" />}
              </div>
              <div className="flex flex-wrap gap-2">
                <input ref={profilePhotoRef} type="file" accept="image/*" className="hidden" onChange={handleProducerPhoto} />
                <button type="button" onClick={() => profilePhotoRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-[#c9d6cd] px-4 py-2.5 text-sm font-semibold text-[#1f4d36] hover:bg-[#f6f7f3]">
                  <Camera size={16} /> {user.avatar ? 'Cambiar foto' : 'Agregar foto'}
                </button>
                {user.avatar && (
                  <button type="button" onClick={deleteProducerPhoto} className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-[#9b3b1c] hover:bg-[#fdeee8]">
                    <Trash2 size={16} /> Eliminar foto
                  </button>
                )}
              </div>
            </div>

            <div className="mt-5 grid gap-4 rounded-2xl border border-[#e2e7df] bg-white p-5 shadow-[0_2px_10px_rgba(24,36,29,0.035)] sm:grid-cols-2 sm:p-6">
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="pr-name">Nombre completo</label>
                <input id="pr-name" className={inputClass} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
              </div>
              <div>
                <label className={labelClass} htmlFor="pr-phone">WhatsApp</label>
                <input id="pr-phone" type="tel" className={inputClass} value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
              </div>
              <div>
                <label className={labelClass} htmlFor="pr-city">Municipio</label>
                <select id="pr-city" className={inputClass} value={profile.city} onChange={(e) => setProfile({ ...profile, city: e.target.value })}>
                  {!MUNICIPALITIES.some((m) => m.name === profile.city) && (
                    <option value={profile.city}>{profile.city}</option>
                  )}
                  {MUNICIPALITIES.map((m) => (
                    <option key={m.id} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="pr-farm">Nombre de la finca</label>
                <input id="pr-farm" className={inputClass} placeholder="Ej: Finca La Esperanza" value={profile.farmName} onChange={(e) => setProfile({ ...profile, farmName: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="pr-farm-address">Dirección privada para recogidas acordadas</label>
                <input id="pr-farm-address" className={inputClass} placeholder="Dirección o indicaciones para llegar a la finca" value={profile.farmAddress} onChange={(e) => setProfile({ ...profile, farmAddress: e.target.value })} />
                <p className="mt-1 text-xs text-[#59645e]">Solo se comparte con el comprador cuando acuerden un pedido para recoger.</p>
              </div>
              <div>
                <label className={labelClass} htmlFor="pr-assoc">Asociación</label>
                <input id="pr-assoc" className={inputClass} placeholder="O escribe Independiente" value={profile.association} onChange={(e) => setProfile({ ...profile, association: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <p className="text-sm text-[#59645e]">
                  Correo de acceso: <span className="font-semibold text-[#2c3a32]">{user.email}</span>
                </p>
              </div>
            </div>

            <button
              type="submit"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#004d36] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#003622] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#004d36]"
            >
              <Save size={16} /> Guardar perfil
            </button>
          </form>
        )}

        {section === 'configuracion' && (
          <div>
            <h1 className="font-editorial text-3xl font-semibold text-[#173b2b]">Configuración</h1>
            <p className="mt-1 text-sm text-[#59645e]">Administra los datos y avisos de tu cuenta de productor.</p>
            <div className="mt-6">
              <AccountSettings user={user} onUpdateProfile={onUpdateProfile} onAccountDeleted={onLogout} />
            </div>
          </div>
        )}
      </main>

      {formOpen && (
        <ProductForm
          user={user}
          editing={editing}
          onCancel={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSave={handleSaveProduct}
        />
      )}
    </div>
  );
};

export default ProducerDashboard;

import React, { useEffect, useMemo, useRef, useState } from 'react';

import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Camera,
  Check,
  Heart,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Settings,
  ShieldCheck,
  Trash2,
  User,
  X,
} from 'lucide-react';

import { ProductCatalog } from '../components/ProductCatalog';
import { ProductModal } from '../components/ProductModal';
import { AccountSettings } from '../components/AccountSettings';
import { AgroCordobaBrand } from '../components/AgroCordobaBrand';
import { PriceReferencePanel } from '../components/PriceReferencePanel';
import { QuotationConversation } from '../components/QuotationConversation';

import { INITIAL_PRODUCTS } from '../data/mockData';

import type { Product, QuotationRequest, UserProfile } from '../types';

/* ============================================================
   DISEÑO
   Verde monte, amarillo maíz y tinta. Letra Archivo:
   condensada en títulos, normal en el resto.
============================================================ */

const C = {
  monte: '#1F4D36',
  tinta: '#18241D',
  maiz: '#E3A72F',
  tierra: '#8C6A4A',
  gris: '#5B665F',
  linea: '#E2E7DF',
  lineaSuave: '#EEF1EB',
  fondo: '#F6F7F3',
  sube: '#1F7A45',
  baja: '#A33A1F',
};

const COND: React.CSSProperties = { fontFamily: "'Playfair Display', Georgia, serif" };

const FONT_URL =
  'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,500;0,600;0,700;1,500;1,600&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap';

/* ============================================================
   TIPOS
============================================================ */

interface BuyerDashboardProps {
  user: UserProfile;
  products?: Product[];
  quotations?: QuotationRequest[];
  onOpenProductModal?: (product: Product) => void;
  onNavigate?: (section: string) => void;
  onUpdateProfile?: (updated: Partial<UserProfile>) => Promise<void> | void;
  onUpdateQuotationStatus?: (id: string, status: QuotationRequest['status']) => Promise<void> | void;
  unreadMessageCounts?: Record<string, number>;
  onLogout?: () => void;
  openChatQuotationId?: string | null;
  onQuotationChatOpened?: (quotationId: string) => void;
  onSubmitQuotation?: (quotation: Omit<QuotationRequest, 'id' | 'createdAt' | 'status'>) => Promise<QuotationRequest | void> | QuotationRequest | void;
}

type Section =
  | 'inicio'
  | 'catalogo'
  | 'pedidos'
  | 'historial'
  | 'favoritos'
  | 'perfil'
  | 'configuracion';

/* ============================================================
   UTILIDADES
============================================================ */

const DEMO_BUYER_EMAIL = 'restaurante.sinu@gmail.com';

const cop = (n: number) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(n);

const copShort = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 2 })} M`
    : cop(n);

const kg = (n: number) => `${n.toLocaleString('es-CO')} kg`;

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

/* Lee fechas en formato "2026-09-20 14:32" o "20/9/2026, 4:15 p. m." */
const parseDate = (value: string): Date | null => {
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3]);
  const co = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (co) return new Date(+co[3], +co[2] - 1, +co[1]);
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

const monthKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`;

const welcomeGreeting = (gender?: string) =>
  gender === 'femenino' ? 'Bienvenida' : gender === 'masculino' ? 'Bienvenido' : 'Te damos la bienvenida';

const todayLabel = () => {
  const t = new Date().toLocaleDateString('es-CO', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const percentChange = (now: number, before: number) =>
  before > 0 ? Math.round(((now - before) / before) * 100) : null;

/* Reduce la foto antes de guardarla para no llenar el navegador */
const resizeImage = (file: File, maxSize = 400): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('El archivo no es una imagen válida.'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('No se pudo procesar la imagen.'));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });

/* ============================================================
   HISTORIAL DE EJEMPLO (solo la cuenta demo del comprador)
   Sirve para que las gráficas se vean completas en la
   presentación. Las cuentas nuevas empiezan vacías.
============================================================ */

const buildDemoHistory = (user: UserProfile): QuotationRequest[] => {
  const now = new Date();
  type Row = [number, string, string, string, string, string, string, number, number, QuotationRequest['status']?];
  const rows: Row[] = [
    // [meses atrás, productId, producto, variedad, productor, asociación, teléfono, kg, $/kg, estado]
    [0, 'prod-1', 'Plátano', 'Plátano', 'Carmelo Doria Martínez', 'ASOPROAGRO Cereté', '573104529811', 850, 2800, 'Pendiente'],
    [0, 'prod-6', 'Maíz', 'Maíz amarillo', 'Jairo Mercado Guzmán', 'ASOSEMILLAS del Sinú', '573126549921', 1000, 1650, 'En negociación'],
    [5, 'prod-1', 'Plátano', 'Plátano', 'Carmelo Doria Martínez', 'ASOPROAGRO Cereté', '573104529811', 600, 3050],
    [5, 'prod-4', 'Yuca', 'Yuca para consumo', 'Efraín Morelo Cogollo', 'Cooperativa COOPCASABE', '573118932410', 500, 2000],
    [4, 'prod-1', 'Plátano', 'Plátano', 'Carmelo Doria Martínez', 'ASOPROAGRO Cereté', '573104529811', 700, 3000],
    [4, 'prod-2', 'Ñame', 'Ñame fresco', 'Luz Elena Paternina', 'ASOCANAS Sabanas', '573217894520', 400, 3450],
    [3, 'prod-1', 'Plátano', 'Plátano', 'Carmelo Doria Martínez', 'ASOPROAGRO Cereté', '573104529811', 650, 2950],
    [3, 'prod-9', 'Mango', 'Mango fresco', 'Rosiris Conde Martelo', 'ASOPROFRUT Bajo Sinú', '573204910287', 300, 3100],
    [2, 'prod-1', 'Plátano', 'Plátano', 'Carmelo Doria Martínez', 'ASOPROAGRO Cereté', '573104529811', 800, 2900],
    [2, 'prod-2', 'Ñame', 'Ñame fresco', 'Luz Elena Paternina', 'ASOCANAS Sabanas', '573217894520', 600, 3400],
    [2, 'prod-3', 'Cacao', 'Cacao en grano', 'Don Argemiro Ballesteros', 'COOPTIERRALTA', '573136201844', 40, 28500],
    [1, 'prod-1', 'Plátano', 'Plátano', 'Carmelo Doria Martínez', 'ASOPROAGRO Cereté', '573104529811', 900, 2850],
    [1, 'prod-4', 'Yuca', 'Yuca para consumo', 'Efraín Morelo Cogollo', 'Cooperativa COOPCASABE', '573118932410', 800, 1950],
    [1, 'prod-9', 'Mango', 'Mango fresco', 'Rosiris Conde Martelo', 'ASOPROFRUT Bajo Sinú', '573204910287', 400, 3100],
    [0, 'prod-2', 'Ñame', 'Ñame fresco', 'Luz Elena Paternina', 'ASOCANAS Sabanas', '573217894520', 1200, 3400],
    [0, 'prod-3', 'Cacao', 'Cacao en grano', 'Don Argemiro Ballesteros', 'COOPTIERRALTA', '573136201844', 60, 28500],
  ];

  return rows.map(([ago, productId, productName, productVariety, producerName, producerAssociation, producerWhatsapp, quantityKg, price, status], i) => {
    const day = ago === 0 ? Math.max(1, now.getDate() - i) : Math.min(3 + i * 2, 26);
    const d = new Date(now.getFullYear(), now.getMonth() - ago, day, 10, 0);
    const subtotal = quantityKg * price;
    const pad = (n: number) => String(n).padStart(2, '0');
    return {
      id: `demo-hist-${i}`,
      productId,
      productName,
      productVariety,
      producerName,
      producerAssociation,
      producerWhatsapp,
      clientName: user.name,
      clientEmail: user.email,
      clientPhone: user.phone,
      clientBusinessType: user.businessType,
      clientCity: user.city,
      quantityKg,
      destinationZone: 'Local Córdoba',
      freightCop: 0,
      subtotalCop: subtotal,
      totalCop: subtotal,
      totalUsd: 0,
      discountPercent: 0,
      notes: '',
      createdAt: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 10:00`,
      status: status || 'Cerrado',
    };
  });
};

/* ============================================================
   GRÁFICAS (SVG, sin librerías)
============================================================ */

const BarChart: React.FC<{ data: { label: string; value: number }[] }> = ({ data }) => {
  const W = 560;
  const H = 190;
  const pad = { top: 18, bottom: 26, left: 8, right: 8 };
  const max = Math.max(...data.map((d) => d.value), 1);
  const slot = (W - pad.left - pad.right) / data.length;
  const barW = slot * 0.56;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Compras por mes: ${data.map((d) => `${d.label} ${copShort(d.value)}`).join(', ')}`}>
      {[0.25, 0.5, 0.75, 1].map((t) => (
        <line key={t} x1={pad.left} x2={W - pad.right} y1={pad.top + (H - pad.top - pad.bottom) * (1 - t)} y2={pad.top + (H - pad.top - pad.bottom) * (1 - t)} stroke={C.lineaSuave} />
      ))}
      {data.map((d, i) => {
        const h = ((H - pad.top - pad.bottom) * d.value) / max;
        const x = pad.left + slot * i + (slot - barW) / 2;
        const y = H - pad.bottom - h;
        const last = i === data.length - 1;
        return (
          <g key={d.label}>
            <rect x={x} y={y} width={barW} height={Math.max(h, d.value ? 2 : 0)} rx={2} fill={last ? C.monte : '#C7D3CA'}>
              <title>{`${d.label}: ${cop(d.value)}`}</title>
            </rect>
            {d.value > 0 && (
              <text x={x + barW / 2} y={y - 5} textAnchor="middle" fontSize="11" fill={last ? C.tinta : C.gris} fontWeight={last ? 700 : 400}>
                {copShort(d.value).replace(' M', 'M')}
              </text>
            )}
            <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize="12" fill={C.gris}>
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

const DONUT_COLORS = [C.monte, C.maiz, C.tierra, '#7FA08B', '#C9B07A'];

const DonutChart: React.FC<{ data: { label: string; value: number }[] }> = ({ data }) => {
  const total = data.reduce((t, d) => t + d.value, 0) || 1;
  const r = 42;
  const circ = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 120 120" className="h-28 w-28 flex-shrink-0 -rotate-90" role="img" aria-label={`Compras por categoría: ${data.map((d) => `${d.label} ${Math.round((d.value / total) * 100)}%`).join(', ')}`}>
        <circle cx="60" cy="60" r={r} fill="none" stroke={C.lineaSuave} strokeWidth="16" />
        {data.map((d, i) => {
          const len = (d.value / total) * circ;
          const el = (
            <circle key={d.label} cx="60" cy="60" r={r} fill="none" stroke={DONUT_COLORS[i % DONUT_COLORS.length]} strokeWidth="16" strokeDasharray={`${len} ${circ - len}`} strokeDashoffset={-offset} />
          );
          offset += len;
          return el;
        })}
      </svg>
      <ul className="min-w-0 flex-1 space-y-1.5 text-[13px]">
        {data.map((d, i) => (
          <li key={d.label} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 flex-shrink-0" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
              <span className="truncate">{d.label}</span>
            </span>
            <b>{Math.round((d.value / total) * 100)}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
};

const LineChart: React.FC<{ points: { label: string; value: number }[] }> = ({ points }) => {
  const W = 320;
  const H = 120;
  const pad = { top: 12, bottom: 18, left: 4, right: 4 };
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const xy = points.map((p, i) => [
    pad.left + ((W - pad.left - pad.right) * i) / Math.max(points.length - 1, 1),
    pad.top + (H - pad.top - pad.bottom) * (1 - (p.value - min) / span),
  ]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${xy[xy.length - 1][0]},${H - pad.bottom} L${xy[0][0]},${H - pad.bottom} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Precio pagado por kilo: ${points.map((p) => `${p.label} ${cop(p.value)}`).join(', ')}`}>
      <path d={area} fill={C.monte} opacity={0.08} />
      <path d={line} fill="none" stroke={C.monte} strokeWidth={2.2} strokeLinejoin="round" />
      {xy.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === xy.length - 1 ? 4 : 2.5} fill={i === xy.length - 1 ? C.monte : '#fff'} stroke={C.monte} strokeWidth={1.5}>
          <title>{`${points[i].label}: ${cop(points[i].value)}/kg`}</title>
        </circle>
      ))}
      <text x={pad.left} y={H - 3} fontSize="11" fill={C.gris}>{points[0].label}</text>
      <text x={W - pad.right} y={H - 3} fontSize="11" fill={C.gris} textAnchor="end">{points[points.length - 1].label}</text>
    </svg>
  );
};

/* ============================================================
   PIEZAS DE INTERFAZ
============================================================ */

const Box: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <section className={`min-w-0 rounded-2xl border bg-white shadow-[0_2px_10px_rgba(24,36,29,0.035)] ${className}`} style={{ borderColor: C.linea }}>
    {children}
  </section>
);

const BoxTitle: React.FC<{ title: string; note?: string; action?: { label: string; onClick: () => void } }> = ({ title, note, action }) => (
  <div className="flex items-baseline justify-between gap-3">
    <h2 className="text-[20px] font-semibold leading-tight" style={COND}>{title}</h2>
    {action ? (
      <button onClick={action.onClick} className="text-[13px] font-medium underline underline-offset-2 hover:no-underline" style={{ color: C.monte }}>
        {action.label}
      </button>
    ) : note ? (
      <span className="text-xs" style={{ color: C.gris }}>{note}</span>
    ) : null}
  </div>
);

const PageHeader: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => (
  <div className="mb-6">
    <h1 className="text-[34px] font-semibold leading-tight" style={COND}>{title}</h1>
    <p className="mt-2 text-[15px]" style={{ color: C.gris }}>{subtitle}</p>
  </div>
);

const Empty: React.FC<{ title: string; text: string; action?: { label: string; onClick: () => void } }> = ({ title, text, action }) => (
  <Box className="px-6 py-12 text-center">
    <p className="text-xl font-bold" style={COND}>{title}</p>
    <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: C.gris }}>{text}</p>
    {action && (
      <button onClick={action.onClick} className="mt-5 rounded px-4 py-2.5 text-sm font-bold text-white hover:opacity-90" style={{ background: C.monte }}>
        {action.label}
      </button>
    )}
  </Box>
);

const STATUS_TEXT: Record<QuotationRequest['status'], { label: string; color: string; weight: number }> = {
  Pendiente: { label: 'Escríbele', color: '#8A5A00', weight: 700 },
  Cotizado: { label: 'Cotizado', color: '#8A5A00', weight: 700 },
  'En negociación': { label: 'En negociación', color: '#8A5A00', weight: 700 },
  Acordado: { label: 'Acordado', color: C.monte, weight: 700 },
  'Contactado WhatsApp': { label: 'En conversación', color: C.monte, weight: 700 },
  'Listo para recoger': { label: 'Listo para recoger', color: C.monte, weight: 700 },
  Entregado: { label: 'Entregado', color: C.monte, weight: 700 },
  Cerrado: { label: 'Cerrado', color: C.gris, weight: 400 },
};

const StatusText: React.FC<{ status: QuotationRequest['status'] }> = ({ status }) => {
  const s = STATUS_TEXT[status];
  return <span style={{ color: s.color, fontWeight: s.weight }}>{s.label}</span>;
};

const STEPS = ['Solicitud enviada', 'Negociación', 'Acuerdo', 'Entrega o recogida', 'Cierre confirmado'];

const stepIndex = (status: QuotationRequest['status']) => {
  if (status === 'Cerrado') return 5;
  if (status === 'Entregado' || status === 'Listo para recoger') return 4;
  if (status === 'Acordado') return 3;
  if (['Contactado WhatsApp', 'En negociación', 'Cotizado'].includes(status)) return 2;
  return 1;
};

const Steps: React.FC<{ status: QuotationRequest['status'] }> = ({ status }) => {
  const done = stepIndex(status);
  return (
    <ol className="flex items-center gap-2 text-xs" aria-label="Avance del pedido">
      {STEPS.map((s, i) => {
        const complete = i < done;
        const current = i === done;
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold"
              style={{
                background: complete ? C.monte : '#fff',
                borderColor: complete || current ? C.monte : C.linea,
                color: complete ? '#fff' : current ? C.monte : C.gris,
              }}
            >
              {complete ? <Check size={11} strokeWidth={3} /> : i + 1}
            </span>
            <span style={{ color: complete || current ? C.tinta : C.gris, fontWeight: current ? 700 : 400 }}>{s}</span>
            {i < STEPS.length - 1 && <span className="hidden h-px w-6 sm:block" style={{ background: complete ? C.monte : C.linea }} />}
          </li>
        );
      })}
    </ol>
  );
};

/* ============================================================
   COMPONENTE PRINCIPAL
============================================================ */

export const BuyerDashboard: React.FC<BuyerDashboardProps> = ({
  user,
  products,
  quotations,
  onOpenProductModal,
  onNavigate,
  onUpdateProfile,
  onUpdateQuotationStatus,
  unreadMessageCounts = {},
  onLogout,
  openChatQuotationId,
  onQuotationChatOpened,
  onSubmitQuotation,
}) => {
  /* ---------- Letra ---------- */
  useEffect(() => {
    if (!document.querySelector(`link[href="${FONT_URL}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = FONT_URL;
      document.head.appendChild(link);
    }
  }, []);

  /* ---------- Estados ---------- */
  const [section, setSection] = useState<Section>('inicio');
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationOpen, setNotificationOpen] = useState(false);
  const notificationReadKey = `agrocordoba_notifications_read_${user.id}`;
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>(() => {
    if (user.authProvider) return [];
    try {
      return JSON.parse(localStorage.getItem(notificationReadKey) || '[]');
    } catch {
      return [];
    }
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMunicipality, setSelectedMunicipality] = useState<string>('Todos');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [localQuotations, setLocalQuotations] = useState<QuotationRequest[]>([]);
  const [photoMessage, setPhotoMessage] = useState('');
  const [quotationActionError, setQuotationActionError] = useState('');

  // Cambios de estado de los pedidos de ejemplo de la cuenta demo
  const [demoStatus, setDemoStatus] = useState<Record<string, QuotationRequest['status']>>(() => {
    try {
      return JSON.parse(localStorage.getItem('agrocordoba_demo_status') || '{}');
    } catch {
      return {};
    }
  });

  const [favorites, setFavorites] = useState<string[]>(() => {
    if (user.authProvider) return [];
    try {
      const saved = localStorage.getItem('agrocordoba_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  /* ---------- Favoritos y avisos sincronizados con Flask ---------- */
  useEffect(() => {
    if (user.authProvider) {
      let active = true;
      const load = async () => {
        try {
          const [favoriteResponse, readResponse] = await Promise.all([
            fetch('/api/favorites', { credentials: 'include' }),
            fetch('/api/notifications/read', { credentials: 'include' }),
          ]);
          const [favoritePayload, readPayload] = await Promise.all([
            favoriteResponse.json(),
            readResponse.json(),
          ]);
          if (!favoriteResponse.ok) throw new Error(favoritePayload.error || 'No se pudieron cargar los favoritos.');
          if (!readResponse.ok) throw new Error(readPayload.error || 'No se pudieron cargar los avisos leídos.');
          if (active) {
            setFavorites(favoritePayload.favoriteIds as string[]);
            setReadNotificationIds(readPayload.quotationIds as string[]);
          }
        } catch (error) {
          if (active) console.error('No se pudieron sincronizar favoritos y avisos:', error);
        }
      };
      void load();
      return () => { active = false; };
    }

    const sync = () => {
      try {
        const saved = localStorage.getItem('agrocordoba_favorites');
        setFavorites(saved ? JSON.parse(saved) : []);
      } catch (error) {
        console.error('No se pudieron sincronizar los favoritos', error);
      }
    };
    window.addEventListener('agrocordoba_favorites_changed', sync);
    return () => window.removeEventListener('agrocordoba_favorites_changed', sync);
  }, [user.id, user.authProvider]);

  /* ---------- Cotizaciones guardadas ---------- */
  useEffect(() => {
    try {
      const saved = localStorage.getItem('agrocordoba_quotations');
      if (saved) setLocalQuotations(JSON.parse(saved));
    } catch (error) {
      console.error('No se pudieron cargar las cotizaciones', error);
    }
  }, []);

  const availableProducts = products ?? INITIAL_PRODUCTS;
  const availableQuotations = quotations ?? localQuotations;

  const myQuotations = useMemo(() => {
    const mine = availableQuotations.filter(
      (q) =>
        q.clientId ? q.clientId === user.id : (
          q.clientEmail?.toLowerCase() === user.email?.toLowerCase() ||
          q.clientName?.toLowerCase() === user.name?.toLowerCase()
        )
    );
    const isDemo = user.email?.toLowerCase() === DEMO_BUYER_EMAIL || user.id === 'usr-client-demo';
    const demo = isDemo
      ? buildDemoHistory(user).map((q) => (demoStatus[q.id] ? { ...q, status: demoStatus[q.id] } : q))
      : [];
    const all = [...mine, ...demo];
    return all.sort(
      (a, b) => (parseDate(b.createdAt)?.getTime() || 0) - (parseDate(a.createdAt)?.getTime() || 0)
    );
  }, [availableQuotations, user, demoStatus]);

  useEffect(() => {
    if (openChatQuotationId && myQuotations.some((quotation) => quotation.id === openChatQuotationId)) {
      setSection('pedidos');
    }
  }, [openChatQuotationId, myQuotations]);

  const openQuotations = myQuotations.filter((q) => q.status !== 'Cerrado');
  const waiting = myQuotations.filter((q) => q.status === 'Pendiente' || q.status === 'Cotizado');
  const unreadNotificationCount = waiting.filter((q) => !readNotificationIds.includes(q.id)).length;
  const closed = myQuotations.filter((q) => q.status === 'Cerrado');
  const unreadMessageCount = myQuotations.reduce(
    (total, quotation) => total + (unreadMessageCounts[quotation.id] || 0),
    0
  );
  const favoriteProducts = availableProducts.filter((p) => favorites.includes(p.id));

  /* ---------- Navegación ---------- */
  const go = (s: Section) => {
    setSection(s);
    setMenuOpen(false);
    setNotificationOpen(false);
    setPhotoMessage('');
    onNavigate?.(s);
    window.scrollTo({ top: 0 });
  };

  /* ---------- Productos ---------- */
  const openProduct = (product: Product) => {
    if (onOpenProductModal) return onOpenProductModal(product);
    setSelectedProduct(product);
  };

  const saveLocal = (list: QuotationRequest[]) => {
    setLocalQuotations(list);
    try {
      localStorage.setItem('agrocordoba_quotations', JSON.stringify(list));
    } catch (error) {
      console.error('No se pudo guardar la cotización', error);
    }
  };

  const handleSubmitQuotation = async (quotation: Omit<QuotationRequest, 'id' | 'createdAt' | 'status'>) => {
    if (onSubmitQuotation) {
      await onSubmitQuotation(quotation);
      setSelectedProduct(null);
      go('pedidos');
      return;
    }
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    saveLocal([
      {
        ...quotation,
        id: `quote-${Date.now()}`,
        createdAt: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`,
        status: 'Pendiente',
      },
      ...localQuotations,
    ]);
    setSelectedProduct(null);
    go('pedidos');
  };

  const setStatus = async (id: string, status: QuotationRequest['status']) => {
    setQuotationActionError('');
    if (id.startsWith('demo-hist-')) {
      const next = { ...demoStatus, [id]: status };
      setDemoStatus(next);
      try {
        localStorage.setItem('agrocordoba_demo_status', JSON.stringify(next));
      } catch {
        /* sin espacio */
      }
      return;
    }
    if (!id.startsWith('demo-hist-') && onUpdateQuotationStatus) {
      try {
        await onUpdateQuotationStatus(id, status);
      } catch (error) {
        setQuotationActionError((error as Error).message || 'No se pudo actualizar el pedido.');
      }
      return;
    }
    saveLocal(localQuotations.map((q) => (q.id === id ? { ...q, status } : q)));
  };

  const toggleFavorite = (productId: string) => {
    const updated = favorites.includes(productId)
      ? favorites.filter((id) => id !== productId)
      : [...favorites, productId];
    setFavorites(updated);
    if (user.authProvider) {
      void fetch('/api/favorites', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favoriteIds: updated }),
      }).then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'No se pudo guardar el favorito.');
      }).catch((error: Error) => {
        setFavorites(favorites);
        window.alert(error.message || 'No se pudo guardar el favorito.');
      });
      return;
    }
    try {
      localStorage.setItem('agrocordoba_favorites', JSON.stringify(updated));
      window.dispatchEvent(new Event('agrocordoba_favorites_changed'));
    } catch (error) {
      console.error('No se pudieron guardar favoritos', error);
    }
  };

  /* ---------- Foto de perfil ---------- */
  const handlePhotoChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      return setPhotoMessage('Selecciona una imagen JPG, PNG o WebP.');
    }
    if (file.size > 10 * 1024 * 1024) return setPhotoMessage('La imagen no puede superar los 10 MB.');
    try {
      const avatar = await resizeImage(file);
      await onUpdateProfile?.({ avatar });
      setPhotoMessage(user.avatar ? 'Foto actualizada.' : 'Foto agregada.');
    } catch (error) {
      setPhotoMessage((error as Error).message || 'No se pudo guardar la foto.');
    }
  };

  const deletePhoto = async () => {
    if (!window.confirm('¿Eliminar tu foto de perfil?')) return;
    try {
      await onUpdateProfile?.({ avatar: '' });
      setPhotoMessage('Foto eliminada.');
    } catch (error) {
      setPhotoMessage((error as Error).message || 'No se pudo eliminar la foto.');
    }
  };

  /* ============================================================
     DATOS DE LAS GRÁFICAS
  ============================================================ */

  const stats = useMemo(() => {
    const now = new Date();
    const thisKey = monthKey(now);
    const prevKey = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));

    const byMonth: Record<string, { value: number; kg: number }> = {};
    myQuotations.forEach((q) => {
      const d = parseDate(q.createdAt);
      if (!d) return;
      const k = monthKey(d);
      byMonth[k] = byMonth[k] || { value: 0, kg: 0 };
      byMonth[k].value += Number(q.totalCop || 0);
      byMonth[k].kg += Number(q.quantityKg || 0);
    });

    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
      return { label: MONTHS[d.getMonth()], value: byMonth[monthKey(d)]?.value || 0 };
    });

    const thisMonth = byMonth[thisKey] || { value: 0, kg: 0 };
    const prevMonth = byMonth[prevKey] || { value: 0, kg: 0 };

    // Por categoría
    const categoryOf = (q: QuotationRequest) =>
      availableProducts.find((p) => p.id === q.productId)?.category || 'Otros';
    const byCat: Record<string, number> = {};
    myQuotations.forEach((q) => {
      byCat[categoryOf(q)] = (byCat[categoryOf(q)] || 0) + Number(q.totalCop || 0);
    });
    const categories = Object.entries(byCat)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);

    // Producto más comprado y lo que ha pagado por kilo
    const kgByProduct: Record<string, number> = {};
    myQuotations.forEach((q) => {
      kgByProduct[q.productName] = (kgByProduct[q.productName] || 0) + q.quantityKg;
    });
    const topProduct = Object.entries(kgByProduct).sort((a, b) => b[1] - a[1])[0]?.[0];
    const pricePoints = myQuotations
      .filter((q) => q.productName === topProduct && q.quantityKg > 0)
      .map((q) => ({ date: parseDate(q.createdAt), value: Math.round(q.totalCop / q.quantityKg) }))
      .filter((p): p is { date: Date; value: number } => !!p.date)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((p) => ({ label: `${p.date.getDate()} ${MONTHS[p.date.getMonth()]}`, value: p.value }));

    const producers = new Set(myQuotations.map((q) => q.producerName));
    const towns = new Set(
      myQuotations
        .map((q) => availableProducts.find((p) => p.id === q.productId)?.municipalityName)
        .filter(Boolean)
    );

    return {
      months,
      thisMonth,
      valueChange: percentChange(thisMonth.value, prevMonth.value),
      kgChange: percentChange(thisMonth.kg, prevMonth.kg),
      prevMonthLabel: MONTHS[(now.getMonth() + 11) % 12].toLowerCase(),
      categories,
      topProduct,
      pricePoints,
      producers: producers.size,
      towns: towns.size,
    };
  }, [myQuotations, availableProducts]);

  // Pizarra: precio promedio por kilo de cada producto del catálogo
  const priceBoard = useMemo(() => {
    const groups: Record<string, number[]> = {};
    availableProducts.forEach((p) => {
      groups[p.name] = groups[p.name] || [];
      groups[p.name].push(p.priceCopKg);
    });
    return Object.entries(groups)
      .map(([name, prices]) => ({
        name,
        price: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
        count: prices.length,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 7);
  }, [availableProducts]);

  /* ============================================================
     PIEZAS QUE DEPENDEN DEL USUARIO
  ============================================================ */

  const avatar = (size: number) => (
    <span
      className="flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-bold text-white"
      style={{ width: size, height: size, background: C.monte }}
    >
      {user.avatar ? (
        <img src={user.avatar} alt="" className="h-full w-full object-cover" />
      ) : (
        user.name
          .split(' ')
          .slice(0, 2)
          .map((w) => w[0])
          .join('')
          .toUpperCase()
      )}
    </span>
  );

  const Change: React.FC<{ value: number | null }> = ({ value }) =>
    value === null ? (
      <span className="text-xs" style={{ color: C.gris }}>Sin datos del mes anterior</span>
    ) : (
      <span className="inline-flex items-center gap-0.5 text-xs font-medium" style={{ color: value >= 0 ? C.sube : C.baja }}>
        {value >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
        {Math.abs(value)}% vs {stats.prevMonthLabel}
      </span>
    );

  const QuotationTable: React.FC<{ rows: QuotationRequest[]; compact?: boolean }> = ({ rows, compact }) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-[13px]">
        <thead>
          <tr style={{ color: C.gris }}>
            <th className="px-4 py-2 text-left text-xs font-medium">Producto</th>
            <th className="px-4 py-2 text-left text-xs font-medium">Productor</th>
            {!compact && <th className="px-4 py-2 text-left text-xs font-medium">Fecha</th>}
            <th className="px-4 py-2 text-right text-xs font-medium">Valor</th>
            <th className="px-4 py-2 text-left text-xs font-medium">Estado</th>
            <th className="px-4 py-2 text-left text-xs font-medium">Conversación</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((q) => (
            <tr key={q.id} className="border-t" style={{ borderColor: C.lineaSuave }}>
              <td className="px-4 py-2.5">
                <b>{q.productName}</b> <span style={{ color: C.gris }}>{kg(q.quantityKg)}</span>
              </td>
              <td className="px-4 py-2.5">{q.producerName}</td>
              {!compact && <td className="px-4 py-2.5" style={{ color: C.gris }}>{q.createdAt.split(' ')[0]}</td>}
              <td className="px-4 py-2.5 text-right">{cop(q.totalCop)}</td>
              <td className="px-4 py-2.5"><StatusText status={q.status} /></td>
              <td className="px-4 py-2.5">
                {(unreadMessageCounts[q.id] || 0) > 0 && (
                  <span className="mb-1 inline-block rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-800">
                    {unreadMessageCounts[q.id]} sin leer
                  </span>
                )}
                {q.clientId && q.producerId
                  ? <QuotationConversation quotationId={q.id} currentUserId={user.id} participantName={q.producerName} productName={q.productName} quotationStatus={q.status} initialUnitPrice={q.quantityKg > 0 ? q.subtotalCop / q.quantityKg : 0} initialQuantityKg={q.quantityKg} initialFreightCop={q.freightCop} fulfillmentMethod={q.fulfillmentMethod} paymentMethod={q.paymentMethod} deliveryAddress={q.deliveryAddress} deliveryLatitude={q.deliveryLatitude} deliveryLongitude={q.deliveryLongitude} producerPickupAddress={q.producerPickupAddress} compact />
                  : <span style={{ color: C.gris }}>—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  /* ============================================================
     INICIO
  ============================================================ */

  const renderInicio = () => {
    const nextUp = waiting[0];
    const fresh = availableProducts.slice(0, 3);

    return (
      <div className="space-y-6">
        {/* INDICADORES */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Compras del mes', value: copShort(stats.thisMonth.value), extra: <Change value={stats.valueChange} /> },
            { label: 'Kilos del mes', value: kg(stats.thisMonth.kg), extra: <Change value={stats.kgChange} /> },
            {
              label: 'Pedidos abiertos',
              value: String(openQuotations.length),
              extra: <span className="text-xs" style={{ color: C.gris }}>{waiting.length ? `${waiting.length} esperando tu mensaje` : 'Todo al día'}</span>,
            },
            {
              label: 'Productores',
              value: String(stats.producers),
              extra: <span className="text-xs" style={{ color: C.gris }}>en {stats.towns} {stats.towns === 1 ? 'municipio' : 'municipios'}</span>,
            },
          ].map((k, i) => (
            <div
              key={k.label}
              className="rounded-2xl border bg-white px-5 py-4 shadow-[0_2px_10px_rgba(24,36,29,0.035)]"
              style={{ borderColor: C.linea }}
            >
              <p className="text-[13px] font-medium" style={{ color: C.gris }}>{k.label}</p>
              <p className="mt-2 text-[28px] font-semibold leading-none tracking-tight" style={COND}>{k.value}</p>
              <div className="mt-2 min-h-5">{k.extra}</div>
            </div>
          ))}
        </div>

        {/* GRÁFICAS */}
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <Box className="p-5 sm:p-6">
            <BoxTitle title="Compras por mes" note="Últimos 6 meses" />
            {stats.months.some((m) => m.value > 0) ? (
              <div className="mt-2"><BarChart data={stats.months} /></div>
            ) : (
              <p className="py-10 text-center text-sm" style={{ color: C.gris }}>Tus compras aparecerán aquí mes a mes.</p>
            )}
          </Box>
          <Box className="p-5 sm:p-6">
            <BoxTitle title="Por categoría" note="Valor comprado" />
            <div className="mt-4">
              {stats.categories.length ? (
                <DonutChart data={stats.categories} />
              ) : (
                <p className="py-8 text-center text-sm" style={{ color: C.gris }}>Aún no hay compras.</p>
              )}
            </div>
          </Box>
        </div>

        {/* PEDIDOS + PRECIO */}
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <Box>
            <div className="px-4 pb-2 pt-4">
              <BoxTitle title="Tus pedidos" action={{ label: 'Ver todos', onClick: () => go('pedidos') }} />
            </div>
            {myQuotations.length ? (
              <>
                <QuotationTable rows={myQuotations.slice(0, 4)} compact />
                {nextUp && (
                  <div className="flex flex-wrap items-center gap-3 border-t px-4 py-3" style={{ borderColor: C.lineaSuave }}>
                    <button
                      type="button"
                      onClick={() => go('pedidos')}
                      className="inline-flex items-center gap-2 rounded border px-3.5 py-2 text-[13px] font-bold hover:bg-[#F7F8F5]"
                      style={{ borderColor: C.linea, color: C.monte }}
                    >
                      <MessageCircle size={16} />
                      Ver conversación
                    </button>
                    <span className="text-xs" style={{ color: C.gris }}>
                      Conversación de {nextUp.productName.toLowerCase()}, {kg(nextUp.quantityKg)}
                    </span>
                  </div>
                )}
              </>
            ) : (
              <p className="px-4 pb-6 pt-2 text-sm" style={{ color: C.gris }}>
                Aún no has pedido nada. Busca un producto en el catálogo y solicita una cotización.
              </p>
            )}
          </Box>

          <Box className="p-5 sm:p-6">
            <BoxTitle title={stats.topProduct ? `Lo que pagas por ${stats.topProduct.toLowerCase()}` : 'Precio pagado'} note="$/kg" />
            {stats.pricePoints.length >= 2 ? (
              <>
                <div className="mt-3"><LineChart points={stats.pricePoints} /></div>
                {(() => {
                  const first = stats.pricePoints[0].value;
                  const last = stats.pricePoints[stats.pricePoints.length - 1].value;
                  const ch = percentChange(last, first) || 0;
                  return (
                    <p className="mt-2 text-[13px]">
                      <b style={{ color: ch <= 0 ? C.sube : C.baja }}>{ch <= 0 ? `Bajó ${Math.abs(ch)}%` : `Subió ${ch}%`}</b>{' '}
                      <span style={{ color: C.gris }}>
                        desde tu primera compra. Hoy pagas {cop(last)} por kilo.
                      </span>
                    </p>
                  );
                })()}
              </>
            ) : (
              <p className="py-8 text-center text-sm" style={{ color: C.gris }}>
                Cuando compres el mismo producto varias veces, verás aquí cómo cambia su precio.
              </p>
            )}
          </Box>
        </div>

        {/* RECIÉN COSECHADO + PIZARRA */}
        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <div className="min-w-0">
            <div className="mb-2">
              <BoxTitle title="Recién cosechado" action={{ label: 'Ir al catálogo', onClick: () => go('catalogo') }} />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {fresh.map((p) => (
                <button key={p.id} onClick={() => openProduct(p)} className="overflow-hidden rounded border bg-white text-left hover:border-[#1F4D36]" style={{ borderColor: C.linea }}>
                  <img src={p.image} alt={p.name} className="h-28 w-full object-cover" />
                  <div className="px-3 py-2.5">
                    <p className="font-bold">{p.name}</p>
                    <p className="text-xs" style={{ color: C.gris }}>{p.municipalityName}, desde {kg(p.minOrderKg)}</p>
                    <p className="mt-1 font-bold">
                      {cop(p.priceCopKg)} <span className="text-xs font-normal" style={{ color: C.gris }}>/kg</span>
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-0 space-y-4">
            <section className="rounded px-4 py-3 text-[#EDEFE8]" style={{ background: C.tinta }}>
              <div className="flex items-baseline justify-between">
                <h2 className="text-[20px] font-bold text-white" style={COND}>Pizarra de precios</h2>
                <span className="text-[11px] text-[#9AA89E]">por kilo</span>
              </div>
              <ul className="mt-2 text-[13px]">
                {priceBoard.map((row, i) => (
                  <li key={row.name} className={`flex justify-between py-1.5 ${i < priceBoard.length - 1 ? 'border-b border-dashed border-[#3A4A40]' : ''}`}>
                    <span>{row.name}</span>
                    <b style={{ color: C.maiz }}>{cop(row.price)}</b>
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-[11px] text-[#9AA89E]">Promedio de los productores en el catálogo hoy.</p>
            </section>

            <PriceReferencePanel productNames={availableProducts.map((product) => product.name)} />

            <div className="border-l-[3px] py-1 pl-3" style={{ borderColor: C.maiz }}>
              <p className="text-[13px] font-bold">Compra segura</p>
              <p className="mt-0.5 text-xs leading-relaxed" style={{ color: C.gris }}>
                Mantén los acuerdos en el chat de AgroCórdoba y confirma las condiciones antes de pagar.
                AgroCórdoba no recibe ni procesa pagos.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  /* ============================================================
     CATÁLOGO
  ============================================================ */

  const renderCatalogo = () => (
    <>
      <PageHeader title="Catálogo" subtitle="Productos publicados por productores de Córdoba. Solicita una cotización y continúa la negociación en el chat de AgroCórdoba." />
      <ProductCatalog
        products={availableProducts}
        selectedMunicipality={selectedMunicipality}
        onSelectMunicipality={setSelectedMunicipality}
        onOpenProductModal={openProduct}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        favoriteIds={favorites}
        onToggleFavorite={toggleFavorite}
      />
    </>
  );

  /* ============================================================
     PEDIDOS
  ============================================================ */

  const renderPedidos = () => (
    <>
      <PageHeader title="Pedidos" subtitle="Sigue cada conversación, acuerdo y entrega hasta confirmar que recibiste el producto." />
      {unreadMessageCount > 0 && (
        <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
          Tienes {unreadMessageCount} {unreadMessageCount === 1 ? 'mensaje sin leer' : 'mensajes sin leer'} en tus conversaciones.
        </p>
      )}
      {openQuotations.length === 0 ? (
        <Empty
          title="No tienes pedidos abiertos"
          text="Cuando pidas una cotización en el catálogo, la verás aquí con su avance."
          action={{ label: 'Ir al catálogo', onClick: () => go('catalogo') }}
        />
      ) : (
        <div className="space-y-3">
          {openQuotations.map((q) => (
            <Box key={q.id} className="p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[22px] font-bold leading-tight" style={COND}>
                    {q.productName} <span className="font-normal" style={{ color: C.gris }}>{kg(q.quantityKg)}</span>
                  </p>
                  <p className="mt-1 text-[13px]" style={{ color: C.gris }}>
                    {q.producerName}, {q.producerAssociation}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs" style={{ color: C.gris }}>{q.status === 'Acordado' || q.status === 'Entregado' || q.status === 'Listo para recoger' ? 'Valor acordado' : 'Valor estimado'}</p>
                  <p className="text-xl font-bold">{cop(q.totalCop)}</p>
                </div>
              </div>

              <div className="mt-4"><Steps status={q.status} /></div>

              <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4" style={{ borderColor: C.lineaSuave }}>
                {(unreadMessageCounts[q.id] || 0) > 0 && (
                  <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-800">
                    {unreadMessageCounts[q.id]} {unreadMessageCounts[q.id] === 1 ? 'mensaje nuevo' : 'mensajes nuevos'}
                  </span>
                )}
                {q.clientId && q.producerId && (
                  <QuotationConversation
                    quotationId={q.id}
                    currentUserId={user.id}
                    participantName={q.producerName}
                    productName={q.productName}
                    quotationStatus={q.status}
                    initialUnitPrice={q.quantityKg > 0 ? q.subtotalCop / q.quantityKg : 0}
                    initialQuantityKg={q.quantityKg}
                    initialFreightCop={q.freightCop}
                    fulfillmentMethod={q.fulfillmentMethod}
                    paymentMethod={q.paymentMethod}
                    deliveryAddress={q.deliveryAddress}
                    deliveryLatitude={q.deliveryLatitude}
                    deliveryLongitude={q.deliveryLongitude}
                    producerPickupAddress={q.producerPickupAddress}
                    autoOpen={openChatQuotationId === q.id}
                    onAutoOpenHandled={() => onQuotationChatOpened?.(q.id)}
                  />
                )}
                {q.status === 'Acordado' && (
                  <span className="text-xs font-semibold text-[#285b3c]">El productor debe confirmar la entrega o preparar la recogida.</span>
                )}
                {(q.status === 'Entregado' || q.status === 'Listo para recoger') && user.authProvider && (
                  <button
                    onClick={() => void setStatus(q.id, 'Cerrado')}
                    className="inline-flex items-center gap-2 rounded bg-[#1F4D36] px-3.5 py-2 text-[13px] font-bold text-white hover:bg-[#173b2b]"
                  >
                    <Check size={16} />
                    Confirmar recepción y cerrar pedido
                  </button>
                )}
                {(q.status === 'Entregado' || q.status === 'Listo para recoger') && !user.authProvider && (
                  <button
                    onClick={() => setStatus(q.id, 'Cerrado')}
                    className="inline-flex items-center gap-2 rounded border px-3.5 py-2 text-[13px] font-bold hover:bg-[#F7F8F5]"
                    style={{ borderColor: C.linea }}
                  >
                    <Check size={16} />
                    Confirmar recepción y cerrar pedido
                  </button>
                )}
                {q.status === 'Cerrado' && <span role="status" className="text-xs font-bold text-[#285b3c]">Negocio cerrado: recepción confirmada por ti.</span>}
                <span className="ml-auto text-xs" style={{ color: C.gris }}>Solicitado el {q.createdAt.split(' ')[0]}</span>
              </div>
            </Box>
          ))}
        </div>
      )}
    </>
  );

  /* ============================================================
     HISTORIAL
  ============================================================ */

  const renderHistorial = () => (
    <>
      <PageHeader title="Historial" subtitle="Compras cuya recepción ya confirmaste." />
      {closed.length === 0 ? (
        <Empty title="Aún no tienes compras cerradas" text="Cuando confirmes que recibiste un pedido, aparecerá aquí." />
      ) : (
        <Box>
          <QuotationTable rows={closed} />
          <div className="flex justify-between border-t px-4 py-3 text-[13px]" style={{ borderColor: C.lineaSuave }}>
            <span style={{ color: C.gris }}>{closed.length} compras</span>
            <b>{cop(closed.reduce((t, q) => t + q.totalCop, 0))}</b>
          </div>
        </Box>
      )}
    </>
  );

  /* ============================================================
     FAVORITOS
  ============================================================ */

  const renderFavoritos = () => (
    <>
      <PageHeader title="Favoritos" subtitle="Productos que guardaste para volver a pedir." />
      {favoriteProducts.length === 0 ? (
        <Empty
          title="No tienes favoritos"
          text="Toca el corazón de un producto en el catálogo para guardarlo aquí."
          action={{ label: 'Ir al catálogo', onClick: () => go('catalogo') }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {favoriteProducts.map((p) => (
            <div key={p.id} className="relative overflow-hidden rounded border bg-white" style={{ borderColor: C.linea }}>
              <button onClick={() => openProduct(p)} className="block w-full text-left">
                <img src={p.image} alt={p.name} className="h-32 w-full object-cover" />
                <div className="px-3 py-2.5">
                  <p className="font-bold">{p.name}</p>
                  <p className="text-xs" style={{ color: C.gris }}>{p.producerName}, {p.municipalityName}</p>
                  <p className="mt-1 font-bold">{cop(p.priceCopKg)} <span className="text-xs font-normal" style={{ color: C.gris }}>/kg</span></p>
                </div>
              </button>
              <button
                onClick={() => toggleFavorite(p.id)}
                className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-[#A33A1F] hover:bg-white"
                aria-label={`Quitar ${p.name} de favoritos`}
              >
                <Heart size={16} className="fill-current" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );

  /* ============================================================
     PERFIL
  ============================================================ */

  const renderPerfil = () => (
    <>
      <PageHeader title="Mi perfil" subtitle="Así te ven los productores cuando les escribes." />
      <Box className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div className="relative w-fit">
            {avatar(104)}
            <label
              htmlFor="buyer-profile-photo"
              className="absolute bottom-0 right-0 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-[3px] border-white text-white"
              style={{ background: C.monte }}
              aria-label={user.avatar ? 'Cambiar foto' : 'Agregar foto'}
            >
              <Camera size={15} />
            </label>
            <input id="buyer-profile-photo" type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={handlePhotoChange} />
          </div>

          <div className="flex-1">
            <p className="text-[28px] font-extrabold leading-none" style={COND}>{user.name}</p>
            <p className="mt-1.5 text-[14px]" style={{ color: C.gris }}>
              {user.businessType}, {user.city}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <label htmlFor="buyer-profile-photo" className="inline-flex cursor-pointer items-center gap-2 rounded border px-3 py-1.5 text-[13px] font-medium hover:bg-[#F7F8F5]" style={{ borderColor: C.linea }}>
                <Camera size={15} />
                {user.avatar ? 'Cambiar foto' : 'Agregar foto'}
              </label>
              {user.avatar && (
                <button onClick={deletePhoto} className="inline-flex items-center gap-2 rounded px-3 py-1.5 text-[13px] font-medium text-[#A33A1F] hover:bg-[#FBEDE8]">
                  <Trash2 size={15} />
                  Eliminar foto
                </button>
              )}
            </div>
            {photoMessage && (
              <p
                role="status"
                className={`mt-2 text-[13px] font-medium ${photoMessage.startsWith('No se pudo') || photoMessage.startsWith('Selecciona') || photoMessage.startsWith('La imagen') ? 'text-red-700' : ''}`}
                style={{ color: photoMessage.startsWith('No se pudo') || photoMessage.startsWith('Selecciona') || photoMessage.startsWith('La imagen') ? undefined : C.monte }}
              >
                {photoMessage}
              </p>
            )}
          </div>
        </div>

        <dl className="mt-6 grid border-t sm:grid-cols-2" style={{ borderColor: C.lineaSuave }}>
          {[
            { icon: <Mail size={15} />, label: 'Correo', value: user.email },
            { icon: <Phone size={15} />, label: 'WhatsApp', value: user.phone || 'Sin registrar' },
            { icon: <MapPin size={15} />, label: 'Municipio', value: user.city || 'Sin registrar' },
            { icon: <User size={15} />, label: 'Tipo de negocio', value: user.businessType },
          ].map((f) => (
            <div key={f.label} className="border-b py-3 sm:pr-6" style={{ borderColor: C.lineaSuave }}>
              <dt className="flex items-center gap-1.5 text-xs" style={{ color: C.gris }}>{f.icon}{f.label}</dt>
              <dd className="mt-0.5 font-medium">{f.value}</dd>
            </div>
          ))}
        </dl>

        <button
          onClick={() => go('configuracion')}
          className="mt-5 inline-flex items-center gap-2 rounded border px-4 py-2 text-[13px] font-bold hover:bg-[#F7F8F5]"
          style={{ borderColor: C.linea }}
        >
          <Settings size={16} />
          Cambiar correo, WhatsApp o contraseña
        </button>
      </Box>
    </>
  );

  /* ============================================================
     CONFIGURACIÓN
  ============================================================ */

  const renderConfiguracion = () => (
    <>
      <PageHeader title="Configuración" subtitle="Tu correo, tu WhatsApp, tu contraseña y tus avisos." />
      <AccountSettings user={user} onUpdateProfile={onUpdateProfile} onAccountDeleted={onLogout} />
    </>
  );

  const content: Record<Section, () => React.ReactNode> = {
    inicio: renderInicio,
    catalogo: renderCatalogo,
    pedidos: renderPedidos,
    historial: renderHistorial,
    favoritos: renderFavoritos,
    perfil: renderPerfil,
    configuracion: renderConfiguracion,
  };

  const tabs: { id: Section; label: string; badge?: number; unreadBadge?: number }[] = [
    { id: 'inicio', label: 'Inicio' },
    { id: 'catalogo', label: 'Catálogo' },
    { id: 'pedidos', label: 'Pedidos', badge: waiting.length, unreadBadge: unreadMessageCount },
    { id: 'historial', label: 'Historial' },
    { id: 'favoritos', label: 'Favoritos', badge: favorites.length || undefined },
    { id: 'perfil', label: 'Mi perfil' },
  ];

  /* ============================================================
     RENDER PRINCIPAL
  ============================================================ */

  return (
    <div className="min-h-screen" style={{ background: C.fondo, color: C.tinta, fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", fontVariantNumeric: 'tabular-nums' }}>
      {/* ENCABEZADO */}
      <header className="sticky top-0 z-30 border-b bg-white" style={{ borderColor: C.linea }}>
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <button onClick={() => go('inicio')} className="flex items-baseline gap-2.5">
            <AgroCordobaBrand compact subtitle="Compras" />
          </button>

          <div className="flex items-center gap-1 sm:gap-2">
            {/* Notificaciones */}
            <div className="relative">
              <button
                onClick={() => {
                  const willOpen = !notificationOpen;
                  setNotificationOpen(willOpen);
                  if (willOpen) {
                    const nextReadIds = [...new Set([...readNotificationIds, ...waiting.map((q) => q.id)])];
                    setReadNotificationIds(nextReadIds);
                    if (user.authProvider) {
                      void fetch('/api/notifications/read', {
                        method: 'PUT',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ quotationIds: waiting.map((q) => q.id) }),
                      }).then(async (response) => {
                        const payload = await response.json().catch(() => ({}));
                        if (!response.ok) throw new Error(payload.error || 'No se pudo guardar el estado de lectura.');
                        setReadNotificationIds(payload.quotationIds as string[]);
                      }).catch((error: Error) => {
                        setReadNotificationIds(readNotificationIds);
                        window.alert(error.message || 'No se pudo guardar el estado de lectura.');
                      });
                    } else {
                      try {
                        localStorage.setItem(notificationReadKey, JSON.stringify(nextReadIds));
                      } catch (error) {
                        console.error('No se pudo guardar el estado de lectura', error);
                      }
                    }
                  }
                  setMenuOpen(false);
                }}
                className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded hover:bg-[#F7F8F5]"
                style={{ color: C.gris }}
                aria-label={unreadNotificationCount ? `Notificaciones, ${unreadNotificationCount} sin leer` : 'Notificaciones, todo leído'}
              >
                <Bell size={19} />
                {unreadNotificationCount > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full" style={{ background: C.maiz }} />}
              </button>
              {notificationOpen && (
                <div className="absolute right-0 top-12 w-80 rounded border bg-white shadow-lg" style={{ borderColor: C.linea }}>
                  <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: C.lineaSuave }}>
                    <p className="font-bold">Avisos</p>
                    <button onClick={() => setNotificationOpen(false)} aria-label="Cerrar avisos" style={{ color: C.gris }}><X size={16} /></button>
                  </div>
                  {waiting.length === 0 ? (
                    <p className="px-4 py-6 text-center text-[13px]" style={{ color: C.gris }}>No tienes avisos nuevos.</p>
                  ) : (
                    waiting.slice(0, 4).map((q) => (
                      <button key={q.id} onClick={() => go('pedidos')} className="block w-full cursor-pointer border-b px-4 py-3 text-left text-[13px] last:border-0 hover:bg-[#F7F8F5]" style={{ borderColor: C.lineaSuave }}>
                        <b>Abre tu conversación con {q.producerName.split(' ')[0]}</b>
                        <span className="block" style={{ color: C.gris }}>Tu pedido de {q.productName.toLowerCase()} ({kg(q.quantityKg)}) espera tu respuesta.</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Configuración */}
            <button
              onClick={() => go('configuracion')}
              className="flex h-10 w-10 items-center justify-center rounded hover:bg-[#F7F8F5]"
              style={{ color: section === 'configuracion' ? C.monte : C.gris }}
              aria-label="Configuración"
              title="Configuración"
            >
              <Settings size={19} />
            </button>

            {/* Usuario */}
            <div className="relative">
              <button
                onClick={() => {
                  setMenuOpen(!menuOpen);
                  setNotificationOpen(false);
                }}
                className="flex items-center gap-2 rounded py-1 pl-1 pr-2 hover:bg-[#F7F8F5]"
              >
                {avatar(32)}
                <span className="hidden text-left leading-tight md:block">
                  <span className="block max-w-[160px] truncate text-[13px] font-medium">{user.name}</span>
                  <span className="block text-[11px]" style={{ color: C.gris }}>{user.businessType}, {user.city}</span>
                </span>
              </button>
              {menuOpen && (
                <div className="absolute right-0 top-12 w-52 rounded border bg-white py-1 shadow-lg" style={{ borderColor: C.linea }}>
                  {[
                    { label: 'Mi perfil', icon: <User size={16} />, onClick: () => go('perfil') },
                    { label: user.avatar ? 'Cambiar foto' : 'Agregar foto', icon: <Camera size={16} />, onClick: () => go('perfil') },
                    { label: 'Configuración', icon: <Settings size={16} />, onClick: () => go('configuracion') },
                  ].map((item) => (
                    <button key={item.label} onClick={item.onClick} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] hover:bg-[#F7F8F5]">
                      {item.icon}
                      {item.label}
                    </button>
                  ))}
                  <div className="my-1 h-px" style={{ background: C.lineaSuave }} />
                  <button onClick={onLogout} className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] text-[#A33A1F] hover:bg-[#FBEDE8]">
                    <LogOut size={16} />
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* PESTAÑAS */}
        <nav className="mx-auto max-w-[1240px] overflow-x-auto px-4 sm:px-6" aria-label="Secciones">
          <ul className="flex min-w-max gap-2">
            {tabs.map((t) => {
              const active = section === t.id;
              return (
                <li key={t.id}>
                  <button
                    onClick={() => go(t.id)}
                    aria-current={active ? 'page' : undefined}
                    className="my-1 flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-[14px] transition-colors hover:bg-[#F6F7F3]"
                    style={{
                      fontWeight: active ? 700 : 400,
                      background: active ? '#EDF3ED' : 'transparent',
                      color: active ? C.monte : C.gris,
                    }}
                  >
                    {t.label}
                    {!!t.badge && (
                      <span
                        className="rounded-sm px-1.5 text-[11px] font-bold"
                        style={t.id === 'pedidos' ? { background: C.maiz, color: '#2B1F05' } : { background: C.lineaSuave, color: C.gris }}
                      >
                        {t.badge}
                      </span>
                    )}
                    {!!t.unreadBadge && (
                      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-800">
                        {t.unreadBadge}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      {/* BIENVENIDA (solo en Inicio) */}
      {section === 'inicio' && (
        <div
          className="border-b bg-cover bg-center"
          style={{
            backgroundImage: `linear-gradient(90deg, rgba(16,38,27,.92) 0%, rgba(16,38,27,.7) 55%, rgba(16,38,27,.35) 100%), url('/images/image.png')`,
          }}
        >
          <div className="mx-auto flex min-h-[176px] max-w-[1240px] flex-wrap items-end justify-between gap-4 px-4 pb-7 pt-9 sm:px-6">
            <div className="text-white">
              <p className="text-[13px] font-medium tracking-wide text-[#D8E4D8]">{todayLabel()}</p>
              <h1 className="mt-2 text-[38px] font-semibold leading-tight sm:text-[46px]" style={COND}>
                {welcomeGreeting(user.gender)}, {user.name.split(' ')[0]}
              </h1>
            </div>
            {waiting.length > 0 && (
              <button
                onClick={() => go('pedidos')}
                className="rounded-full border px-4 py-2.5 text-[13px] font-semibold shadow-sm transition hover:brightness-95"
                style={{ background: C.maiz, borderColor: '#F2C96A', color: '#2B1F05' }}
              >
                {waiting.length} {waiting.length === 1 ? 'pedido espera' : 'pedidos esperan'} tu mensaje
              </button>
            )}
          </div>
        </div>
      )}

      {/* CONTENIDO */}
      <main className="mx-auto max-w-[1240px] overflow-x-hidden px-4 py-7 sm:px-6 sm:py-8">
        {quotationActionError && (
          <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
            {quotationActionError}
          </p>
        )}
        {content[section]()}
      </main>

      <footer className="mx-auto flex max-w-[1240px] items-center gap-2 px-4 pb-8 text-xs sm:px-6" style={{ color: C.gris }}>
        <ShieldCheck size={14} />
        AgroCórdoba no cobra ni maneja pagos. Cada compra se acuerda directamente con el productor.
      </footer>

      {/* VENTANA DEL PRODUCTO */}
      {!onOpenProductModal && selectedProduct && (
        <ProductModal
          product={selectedProduct}
          onClose={() => setSelectedProduct(null)}
          currentUser={user}
          onSubmitQuotation={handleSubmitQuotation}
        />
      )}
    </div>
  );
};

export default BuyerDashboard;

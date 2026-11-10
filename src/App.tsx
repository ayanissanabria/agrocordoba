import React, { useState, useEffect, lazy, Suspense } from 'react';
import { io } from 'socket.io-client';

import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { HomeStats } from './components/HomeStats';
import { HowItWorks } from './components/HowItWorks';
import { CordobaMap } from './components/CordobaMap';
import { ProductCatalog } from './components/ProductCatalog';
import { ProductModal } from './components/ProductModal';
import { ODS8ImpactSection } from './components/ODS8ImpactSection';
import { FAQSection } from './components/FAQSection';
import { Footer } from './components/Footer';
import { AuthModal } from './components/AuthModal';

import { INITIAL_PRODUCTS, INITIAL_QUOTATIONS } from './data/mockData';
import { Product, QuotationRequest, UserProfile } from './types';
import { getProductPath } from './utils/productSeo';

const LEGACY_DEMO_IMAGE_IDS: Record<string, string> = {
  'prod-1': 'photo-1571771894821-ce9b6c11b08e',
  'prod-2': 'photo-1590165482129-1b8b27698780',
  'prod-3': 'photo-1549007994-cb92caebd54b',
  'prod-4': 'photo-1596040033229-a9821ebd058d',
  'prod-10': 'photo-1509440159596-0249088772ff',
  'prod-11': 'photo-1587049352846-4a222e784d38',
};

const getProductIdFromPath = (pathname: string): string | null => {
  const match = pathname.match(/^\/producto\/[^/]+\/([^/]+)\/?$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
};

// Paneles pesados: se descargan solo cuando el usuario los necesita
const AdminPanel = lazy(() =>
  import('./components/AdminPanel').then((m) => ({ default: m.AdminPanel }))
);
const BuyerDashboard = lazy(() => import('./pages/BuyerDashboard'));
const ProducerDashboard = lazy(() => import('./pages/ProducerDashboard'));

const PanelLoader = () => (
  <div className="flex min-h-[60vh] items-center justify-center text-[#14532d]">
    Cargando…
  </div>
);

const ProducerReviewNotice: React.FC<{ status?: UserProfile['status']; onRefresh: () => void; onLogout: () => void }> = ({ status, onRefresh, onLogout }) => (
  <main className="flex flex-1 items-center justify-center bg-[#f6f7f3] px-5 py-16">
    <section className="w-full max-w-xl rounded-3xl border border-[#dce6de] bg-white p-8 text-center shadow-sm">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-2xl">⌛</div>
      <h1 className="mt-5 font-editorial text-3xl font-semibold text-[#173b2b]">
        {status === 'pendiente' ? 'Tu cuenta está en revisión' : 'Tu cuenta está desactivada'}
      </h1>
      <p className="mt-3 leading-7 text-[#59645e]">
        {status === 'pendiente'
          ? 'El equipo de AgroCórdoba debe aprobar tus datos antes de que puedas publicar cosechas o gestionar cotizaciones.'
          : 'Comunícate con el equipo de AgroCórdoba si necesitas revisar el estado de tu cuenta.'}
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button onClick={onRefresh} className="rounded-xl bg-[#004d36] px-5 py-3 font-semibold text-white hover:bg-[#003622]">Comprobar estado</button>
        <button onClick={onLogout} className="rounded-xl border border-[#c9d6cd] px-5 py-3 font-semibold text-[#2c3a32] hover:bg-[#f6f7f3]">Cerrar sesión</button>
      </div>
    </section>
  </main>
);

const requestProductApi = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'No se pudo guardar el producto.');
  return payload as T;
};

export const App: React.FC = () => {
  // =====================================================
  // MONEDA
  // =====================================================
  const [currency, setCurrency] = useState<'COP' | 'USD'>(() => {
    const saved = localStorage.getItem('agrocordoba_currency');
    return (saved as 'COP' | 'USD') || 'COP';
  });

  // =====================================================
  // PRODUCTOS
  // =====================================================
  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('agrocordoba_products');
    if (saved) {
      try {
        const savedProducts = JSON.parse(saved) as Product[];
        return savedProducts.map((product) => {
          const initialProduct = INITIAL_PRODUCTS.find(
            (initial) => initial.id === product.id
          );
          const legacyImageId = LEGACY_DEMO_IMAGE_IDS[product.id];

          if (
            initialProduct &&
            legacyImageId &&
            product.image.includes(legacyImageId)
          ) {
            return { ...product, image: initialProduct.image };
          }

          return product;
        });
      } catch (e) {
        console.error('Error leyendo productos:', e);
      }
    }
    return INITIAL_PRODUCTS;
  });
  const [selectedProductForModal, setSelectedProductForModal] =
    useState<Product | null>(() => {
      const productId = getProductIdFromPath(window.location.pathname);
      return products.find((product) => product.id === productId) || null;
    });

  // =====================================================
  // COTIZACIONES
  // =====================================================
  const [quotations, setQuotations] = useState<QuotationRequest[]>(() => {
    const saved = localStorage.getItem('agrocordoba_quotations');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error leyendo cotizaciones:', e);
      }
    }
    return INITIAL_QUOTATIONS;
  });
  const [quotationToOpenInChat, setQuotationToOpenInChat] = useState<string | null>(null);
  const [unreadMessageCounts, setUnreadMessageCounts] = useState<Record<string, number>>({});

  // =====================================================
  // USUARIO ACTUAL
  // =====================================================
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    const saved = localStorage.getItem('agrocordoba_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error leyendo usuario:', e);
      }
    }
    return null;
  });

  // =====================================================
  // NAVEGACIÓN
  // =====================================================
  const [activeSection, setActiveSection] = useState<string>('catalogo');
  const [selectedMunicipality, setSelectedMunicipality] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // =====================================================
  // MODALES
  // =====================================================
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [authInitialTab, setAuthInitialTab] =
    useState<'login' | 'register' | 'profile'>('login');
  const [authNotice, setAuthNotice] = useState('');
  const [isAdminView, setIsAdminView] = useState<boolean>(false);
  const isProductPath = getProductIdFromPath(window.location.pathname) !== null;

  // =====================================================
  // GUARDAR EN LOCALSTORAGE
  // =====================================================
  useEffect(() => {
    localStorage.setItem('agrocordoba_currency', currency);
  }, [currency]);

  useEffect(() => {
    try {
      localStorage.setItem('agrocordoba_products', JSON.stringify(products));
    } catch (e) {
      console.error('No se pudieron guardar los productos:', e);
    }
  }, [products]);

  // El catálogo conserva sus productos de referencia y suma las publicaciones
  // persistidas por Flask para que aparezcan en cualquier dispositivo.
  useEffect(() => {
    let active = true;
    requestProductApi<{ products: Product[] }>('/api/products')
      .then(({ products: serverProducts }) => {
        if (!active) return;
        setProducts((current) => {
          const merged = new Map(current.map((product) => [product.id, product]));
          serverProducts.forEach((product) => merged.set(product.id, product));
          return [...merged.values()];
        });
      })
      .catch((error) => console.error('No se pudieron cargar publicaciones del backend:', error));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const syncProductRoute = () => {
      const productId = getProductIdFromPath(window.location.pathname);
      setSelectedProductForModal(
        productId
          ? products.find((product) => product.id === productId) || null
          : null
      );
    };
    syncProductRoute();
    window.addEventListener('popstate', syncProductRoute);
    return () => window.removeEventListener('popstate', syncProductRoute);
  }, [products]);

  useEffect(() => {
    if (!currentUser?.authProvider) {
      localStorage.setItem('agrocordoba_quotations', JSON.stringify(quotations));
    }
  }, [quotations, currentUser?.authProvider]);

  // Al cambiar de usuario, recargar las cotizaciones guardadas.
  // El panel del comprador guarda sus cotizaciones directamente en el
  // navegador; así el productor ve las nuevas cuando inicia sesión.
  useEffect(() => {
    if (currentUser?.authProvider) return;
    const saved = localStorage.getItem('agrocordoba_quotations');
    if (saved) {
      try {
        setQuotations(JSON.parse(saved));
      } catch (e) {
        console.error('Error leyendo cotizaciones:', e);
      }
    }
  }, [currentUser?.email, currentUser?.authProvider]);

  useEffect(() => {
    if (!currentUser?.authProvider || !['cliente', 'productor', 'admin'].includes(currentUser.role)) return;
    let active = true;
    const refreshQuotations = () => {
      requestProductApi<{ quotations: QuotationRequest[] }>('/api/quotations')
        .then(({ quotations: savedQuotes }) => {
        if (!active) return;
        setQuotations(savedQuotes);
      })
      .catch((error) => console.error('No se pudieron cargar las cotizaciones del backend:', error));
    };
    refreshQuotations();
    window.addEventListener('focus', refreshQuotations);
    return () => {
      active = false;
      window.removeEventListener('focus', refreshQuotations);
    };
  }, [currentUser?.id, currentUser?.authProvider, currentUser?.role]);

  useEffect(() => {
    if (!currentUser?.authProvider || !['cliente', 'productor'].includes(currentUser.role)) return;
    let active = true;
    requestProductApi<{ counts: Record<string, number> }>('/api/notifications/unread-messages')
      .then(({ counts }) => {
        if (active) setUnreadMessageCounts(counts);
      })
      .catch((error) => console.error('No se pudieron cargar los mensajes pendientes:', error));
    return () => { active = false; };
  }, [currentUser?.id, currentUser?.authProvider, currentUser?.role]);

  useEffect(() => {
    if (!currentUser?.authProvider || !['cliente', 'productor'].includes(currentUser.role)) {
      setUnreadMessageCounts({});
      return;
    }
    const socket = io({ withCredentials: true });
    socket.on('quotation:updated', (updatedQuotation: QuotationRequest) => {
      setQuotations((current) => current.map((quotation) => (
        quotation.id === updatedQuotation.id
          ? { ...quotation, ...updatedQuotation }
          : quotation
      )));
    });
    socket.on('quotation:unread', (update: { quotationId: string; count: number }) => {
      setUnreadMessageCounts((current) => ({ ...current, [update.quotationId]: update.count }));
    });
    socket.connect();
    return () => {
      socket.disconnect();
    };
  }, [currentUser?.id, currentUser?.authProvider, currentUser?.role]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('agrocordoba_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('agrocordoba_user');
    }
  }, [currentUser]);

  // Para cuentas reales, la cookie HttpOnly de Flask es la fuente de la sesión.
  // Los accesos de demostración no tienen una cuenta en el backend.
  useEffect(() => {
    if (!currentUser?.authProvider) return;
    let active = true;
    fetch('/api/auth/me', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('La sesión del servidor venció.');
        return response.json() as Promise<{ user: UserProfile }>;
      })
      .then(({ user }) => {
        if (active) setCurrentUser(user);
      })
      .catch(() => {
        if (active) setCurrentUser(null);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const googleLogin = params.get('google_login');
    if (!googleLogin) return;

    window.history.replaceState(
      {},
      '',
      `${window.location.pathname}${window.location.hash}`
    );

    if (googleLogin !== 'success') {
      setAuthNotice(
        googleLogin === 'setup'
          ? 'Para activar Google, configura las credenciales indicadas en backend/README.md.'
          : 'No se pudo completar el acceso con Google. Inténtalo de nuevo.'
      );
      setAuthInitialTab('login');
      setAuthModalOpen(true);
      return;
    }

    fetch('/api/auth/me', { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error('No se encontró una sesión de Google.');
        return response.json() as Promise<{ user: UserProfile }>;
      })
      .then(({ user }) => {
        setCurrentUser(user);
        setIsAdminView(false);
        setAuthModalOpen(false);
        setAuthNotice('');
      })
      .catch(() => {
        setAuthNotice('No se pudo recuperar tu sesión. Vuelve a iniciar sesión.');
        setAuthInitialTab('login');
        setAuthModalOpen(true);
      });
  }, []);

  // =====================================================
  // CAMBIAR MONEDA
  // =====================================================
  const handleToggleCurrency = () => {
    setCurrency((prev) => (prev === 'COP' ? 'USD' : 'COP'));
  };

  // =====================================================
  // NAVEGACIÓN GENERAL
  // =====================================================
  const handleNavigate = (sectionId: string) => {
    setActiveSection(sectionId);

    if (sectionId === 'hero') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  // =====================================================
  // MAPA
  // =====================================================
  const handleSelectMunicipalityFromMap = (mId: string) => {
    setSelectedMunicipality(mId);
  };

  const handleFilterCatalogByMunicipality = (mId: string) => {
    setSelectedMunicipality(mId);
    handleNavigate('catalogo');
  };

  // =====================================================
  // LOGIN / REGISTRO / LOGOUT
  // =====================================================
  const handleOpenAuth = (
    initialTab: 'login' | 'register' | 'profile' = 'login'
  ) => {
    setAuthNotice('');
    setAuthInitialTab(initialTab);
    setAuthModalOpen(true);
  };

  const handleLogin = (user: UserProfile) => {
    setCurrentUser(user);
    setIsAdminView(false);
    setAuthModalOpen(false);
  };

  const handleLogout = () => {
    void fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
    }).catch(() => undefined);
    setCurrentUser(null);
    setIsAdminView(false);
    setAuthModalOpen(false);
  };

  const handleRefreshProducerStatus = async () => {
    try {
      const response = await fetch('/api/auth/me', { credentials: 'include' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo consultar el estado.');
      setCurrentUser(payload.user as UserProfile);
    } catch (error) {
      window.alert((error as Error).message || 'No se pudo consultar el estado.');
    }
  };

  // =====================================================
  // ACTUALIZAR PERFIL
  // =====================================================
  const handleUpdateProfile = async (updated: Partial<UserProfile>) => {
    if (!currentUser) {
      return;
    }

    let updatedUser: UserProfile = {
      ...currentUser,
      ...updated,
    };

    if (currentUser.authProvider) {
      const profileChanges = Object.fromEntries(
        Object.entries(updated).filter(([key]) =>
          ['avatar', 'city', 'farmName', 'farmAddress', 'association', 'businessType'].includes(key)
        )
      );
      if (Object.keys(profileChanges).length) {
        const { user } = await requestProductApi<{ user: UserProfile }>('/api/account/profile', {
          method: 'PATCH',
          body: JSON.stringify(profileChanges),
        });
        updatedUser = { ...updatedUser, ...user };
      }
    }
    setCurrentUser(updatedUser);

    // Mantener el perfil guardado aunque el usuario cierre sesión.
    // Así la foto, nombre, teléfono, municipio, etc. vuelven a aparecer
    // cuando inicia sesión nuevamente.
    try {
      const key = 'agrocordoba_registered_users';
      const saved = localStorage.getItem(key);
      const users: UserProfile[] = saved ? JSON.parse(saved) : [];

      const existingIndex = users.findIndex(
        (user) =>
          user.email.toLowerCase().trim() === currentUser.email.toLowerCase().trim()
      );

      if (existingIndex >= 0) {
        users[existingIndex] = updatedUser;
      } else {
        users.push(updatedUser);
      }

      localStorage.setItem(key, JSON.stringify(users));
    } catch (error) {
      console.error('No se pudo guardar el perfil del usuario:', error);
    }
  };

  // =====================================================
  // MODAL DEL PRODUCTO
  // =====================================================
  const handleOpenProductModal = (product: Product) => {
    window.history.pushState(
      { agroProductPage: true },
      '',
      getProductPath(product)
    );
    setSelectedProductForModal(product);
  };

  const handleCloseProductPage = () => {
    if (window.history.state?.agroProductPage) {
      window.history.back();
      return;
    }
    window.history.replaceState({}, '', '/');
    setSelectedProductForModal(null);
  };

  // =====================================================
  // CREAR COTIZACIÓN
  // =====================================================
  const handleSubmitQuotation = async (
    newQuotationData: Omit<QuotationRequest, 'id' | 'createdAt' | 'status'>
  ): Promise<QuotationRequest | void> => {
    if (currentUser?.role === 'cliente' && currentUser.authProvider) {
      const { quotation } = await requestProductApi<{ quotation: QuotationRequest }>('/api/quotations', {
        method: 'POST', body: JSON.stringify(newQuotationData),
      });
      setQuotations((prev) => [quotation, ...prev.filter((item) => item.id !== quotation.id)]);
      setQuotationToOpenInChat(quotation.id);
      if (getProductIdFromPath(window.location.pathname)) {
        window.history.replaceState({}, '', '/');
        setSelectedProductForModal(null);
      }
      return quotation;
    }
    const newQuotation: QuotationRequest = {
      ...newQuotationData,
      id: `COT-${Math.floor(1000 + Math.random() * 9000)}`,
      createdAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
      status: 'Pendiente',
    };

    setQuotations((prev) => [newQuotation, ...prev]);
    return newQuotation;
  };

  // =====================================================
  // ADMIN - PRODUCTOS Y COTIZACIONES
  // =====================================================
  const handleUpdateProduct = async (updated: Product) => {
    if (currentUser?.role === 'productor' && currentUser.authProvider) {
      const { product } = await requestProductApi<{ product: Product }>(`/api/products/${updated.id}`, {
        method: 'PUT', body: JSON.stringify(updated),
      });
      setProducts((prev) => prev.map((item) => item.id === product.id ? product : item));
      return;
    }
    if (currentUser?.role === 'admin' && currentUser.authProvider) {
      const { product } = await requestProductApi<{ product: Product }>(`/api/products/${updated.id}`, {
        method: 'PUT', body: JSON.stringify(updated),
      });
      setProducts((prev) => prev.map((item) => item.id === product.id ? product : item));
      return;
    }
    setProducts((prev) => prev.map((product) => product.id === updated.id ? updated : product));
  };

  const handleAddProduct = async (newProdData: Omit<Product, 'id'>) => {
    if (currentUser?.role === 'productor' && currentUser.authProvider) {
      const { product } = await requestProductApi<{ product: Product }>('/api/products', {
        method: 'POST', body: JSON.stringify(newProdData),
      });
      setProducts((prev) => [product, ...prev]);
      return;
    }
    if (currentUser?.role === 'admin' && currentUser.authProvider) {
      const { product } = await requestProductApi<{ product: Product }>('/api/admin/products', {
        method: 'POST', body: JSON.stringify(newProdData),
      });
      setProducts((prev) => [product, ...prev]);
      return;
    }
    const newProduct: Product = {
      ...newProdData,
      id: `prod-${Date.now()}`,
    };
    setProducts((prev) => [newProduct, ...prev]);
  };

  const handleDeleteProduct = async (id: string) => {
    if ((currentUser?.role === 'productor' || currentUser?.role === 'admin') && currentUser.authProvider) {
      await requestProductApi<{ ok: boolean }>(`/api/products/${id}`, { method: 'DELETE' });
    }
    setProducts((prev) => prev.filter((product) => product.id !== id));
  };

  const handleUpdateQuotationStatus = async (
    id: string,
    status: QuotationRequest['status']
  ) => {
    if (
      ['cliente', 'productor'].includes(currentUser?.role || '') &&
      currentUser?.authProvider &&
      !id.startsWith('COT-')
    ) {
      const { quotation } = await requestProductApi<{ quotation: QuotationRequest }>(`/api/quotations/${id}`, {
        method: 'PATCH', body: JSON.stringify({ status }),
      });
      setQuotations((prev) => prev.map((item) => item.id === id ? quotation : item));
      return;
    }
    setQuotations((prev) =>
      prev.map((quotation) =>
        quotation.id === id ? { ...quotation, status } : quotation
      )
    );
  };

  // =====================================================
  // COTIZACIONES DEL CLIENTE
  // =====================================================
  const clientQuotations = quotations.filter((quotation) => {
    if (!currentUser) {
      return false;
    }
    return (
      quotation.clientEmail === currentUser.email ||
      quotation.clientName.toLowerCase() === currentUser.name.toLowerCase()
    );
  });

  // Comprador y productor tienen su propio panel (sin navbar ni footer públicos)
  const hasOwnPanel =
    currentUser?.role === 'cliente' || currentUser?.role === 'productor';

  // =====================================================
  // INTERFAZ
  // =====================================================
  return (
    <div className="min-h-screen flex flex-col bg-[#f1efdf] text-[#212529] selection:bg-[#e8fe85] selection:text-[#07503f]">
      {/* NAVBAR PÚBLICO: no aparece para comprador ni productor */}
      {!isProductPath && !hasOwnPanel && (
        <Navbar
          currency={currency}
          onToggleCurrency={handleToggleCurrency}
          currentUser={currentUser}
          onOpenAuth={handleOpenAuth}
          onOpenAdmin={() => {
            if (currentUser?.role === 'admin') {
              setIsAdminView(true);
            }
          }}
          isAdminView={isAdminView}
          onExitAdmin={() => {
            setIsAdminView(false);
          }}
          activeSection={activeSection}
          onNavigate={handleNavigate}
        />
      )}

      {isProductPath ? (
        selectedProductForModal ? (
          <ProductModal
            product={selectedProductForModal}
            isPage
            onClose={handleCloseProductPage}
            currentUser={currentUser}
            onRequireLogin={() => handleOpenAuth('login')}
            onSubmitQuotation={handleSubmitQuotation}
          />
        ) : (
          <main className="flex flex-1 items-center justify-center bg-[#f1efdf] px-5 py-20 text-center">
            <div>
              <h1 className="font-editorial text-3xl font-semibold text-[#173b2b]">Cargando producto…</h1>
              <p className="mt-3 text-[#59645e]">Si esta ficha no aparece, el producto ya no está publicado.</p>
              <a href="/" className="mt-5 inline-flex rounded-xl bg-[#004d36] px-5 py-3 font-semibold text-white">Ir al inicio</a>
            </div>
          </main>
        )
      ) : isAdminView ? (
        /* ADMINISTRADOR */
        <main className="flex-1">
          <Suspense fallback={<PanelLoader />}>
            <AdminPanel
              products={products}
              quotations={quotations}
              onUpdateProduct={handleUpdateProduct}
              onAddProduct={handleAddProduct}
              onDeleteProduct={handleDeleteProduct}
              onExit={() => {
                setIsAdminView(false);
              }}
              currency={currency}
            />
          </Suspense>
        </main>
      ) : currentUser?.role === 'cliente' ? (
        /* COMPRADOR: ve solo su dashboard (sin navbar, hero, catálogo,
           mapa, FAQ ni footer públicos) */
        <main className="flex-1">
          <Suspense fallback={<PanelLoader />}>
            <BuyerDashboard
              user={currentUser}
              products={products}
              quotations={quotations}
              unreadMessageCounts={unreadMessageCounts}
              onUpdateQuotationStatus={handleUpdateQuotationStatus}
              openChatQuotationId={quotationToOpenInChat}
              onQuotationChatOpened={(quotationId) => {
                setQuotationToOpenInChat((current) => current === quotationId ? null : current);
              }}
              onSubmitQuotation={handleSubmitQuotation}
              onNavigate={(section) => {
                console.log('Sección del comprador:', section);
              }}
              onUpdateProfile={handleUpdateProfile}
              onLogout={handleLogout}
            />
          </Suspense>
        </main>
      ) : currentUser?.role === 'productor' && currentUser.status !== 'activo' ? (
        <ProducerReviewNotice status={currentUser.status} onRefresh={handleRefreshProducerStatus} onLogout={handleLogout} />
      ) : currentUser?.role === 'productor' ? (
        /* PRODUCTOR: su panel para publicar productos y responder cotizaciones */
        <main className="flex-1">
          <Suspense fallback={<PanelLoader />}>
            <ProducerDashboard
              user={currentUser}
              products={products}
              quotations={quotations}
              unreadMessageCounts={unreadMessageCounts}
              onAddProduct={handleAddProduct}
              onUpdateProduct={handleUpdateProduct}
              onDeleteProduct={handleDeleteProduct}
              onUpdateQuotationStatus={handleUpdateQuotationStatus}
              onUpdateProfile={handleUpdateProfile}
              onLogout={handleLogout}
            />
          </Suspense>
        </main>
      ) : (
        /* PÁGINA PRINCIPAL PÚBLICA */
        <main className="flex-1">
          <Hero
            onExploreCatalog={() => handleNavigate('catalogo')}
            onExploreMap={() => handleNavigate('mapa')}
            onOpenAuth={(mode) => handleOpenAuth(mode || 'register')}
          />

          <HomeStats />

          <HowItWorks
            onExploreCatalog={() => handleNavigate('catalogo')}
            onOpenAuth={(mode) => handleOpenAuth(mode || 'register')}
          />

          <ProductCatalog
            products={products}
            selectedMunicipality={selectedMunicipality}
            onSelectMunicipality={setSelectedMunicipality}
            onOpenProductModal={handleOpenProductModal}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />

          <CordobaMap
            selectedMunicipalityId={
              selectedMunicipality === 'all' ? 'monteria' : selectedMunicipality
            }
            onSelectMunicipality={handleSelectMunicipalityFromMap}
            onFilterCatalogByMunicipality={handleFilterCatalogByMunicipality}
          />

          <ODS8ImpactSection onExploreMunicipality={handleFilterCatalogByMunicipality} />

          <FAQSection />
        </main>
      )}

      {/* FOOTER PÚBLICO: no aparece para comprador ni productor */}
      {!isProductPath && !hasOwnPanel && (
        <Footer
          onNavigate={handleNavigate}
          onFilterByMunicipality={handleFilterCatalogByMunicipality}
          onOpenAdmin={() => {
            if (currentUser?.role === 'admin') {
              setIsAdminView(true);
            }
          }}
        />
      )}

      {/* MODAL PRODUCTO */}
      {!isProductPath && selectedProductForModal && (
        <ProductModal
          product={selectedProductForModal}
          onClose={handleCloseProductPage}
          currentUser={currentUser}
          onRequireLogin={() => handleOpenAuth('login')}
          onSubmitQuotation={handleSubmitQuotation}
        />
      )}

      {/* MODAL AUTENTICACIÓN */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => {
          setAuthModalOpen(false);
          setAuthNotice('');
        }}
        currentUser={currentUser}
        onLogin={handleLogin}
        onLogout={handleLogout}
        onUpdateProfile={handleUpdateProfile}
        initialTab={authInitialTab}
        clientQuotations={clientQuotations}
        googleLoginMessage={authNotice}
      />
    </div>
  );
};

export default App;

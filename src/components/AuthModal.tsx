import React, { useEffect, useState } from 'react';
import {
  X,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  Leaf,
  ShoppingCart,
  Sprout,
  CheckCircle2,
  MapPin,
  Users,
  Store,
  UserPlus,
  Phone,
  Building2,
  Check,
  AlertCircle,
  User,
  ChevronDown,
} from 'lucide-react';

import { UserProfile, QuotationRequest, BusinessType } from '../types';
import { AgroCordobaBrand } from './AgroCordobaBrand';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onLogin: (user: UserProfile) => void;
  onLogout: () => void;
  onUpdateProfile: (updated: Partial<UserProfile>) => void;
  initialTab?: 'login' | 'register' | 'profile';
  clientQuotations: QuotationRequest[];
  googleLoginMessage?: string;
}

/* =========================================================
   CONSTANTES
========================================================= */

const USERS_STORAGE_KEY = 'agrocordoba_registered_users';

const AUTH_PHOTOS = [
  { src: '/images/campesinos-colombia.jpg', label: 'Campesinos trabajando entre cultivos', credit: 'Imagen del archivo local' },
  { src: '/images/campesino-colombia.jpg', label: 'Manos campesinas en la cosecha', credit: 'Imagen del archivo local' },
  { src: '/images/cacao-real.jpg', label: 'Cacao cosechado', credit: 'Kawê Rodrigues · Unsplash', source: 'https://unsplash.com/photos/cocoa-beans-drying-in-front-of-a-dark-wooden-building-jnHTDiAo2kw' },
  { src: '/images/yuca-real.jpg', label: 'Yuca recién cosechada', credit: 'Daniel Dan · Unsplash', source: 'https://unsplash.com/photos/pile-of-freshly-harvested-cassava-roots-sixDoAtyVwo' },
];

/* =========================================================
   MUNICIPIOS
========================================================= */

const MUNICIPALITIES = [
  'Montería',
  'Cereté',
  'Sahagún',
  'Tierralta',
  'Planeta Rica',
  'Montelíbano',
  'Ayapel',
  'Chinú',
  'Lorica',
  'San Pelayo',
  'Ciénaga de Oro',
  'San Bernardo del Viento',
];

/* =========================================================
   TIPOS DE NEGOCIO
========================================================= */

const BUSINESS_TYPES: BusinessType[] = [
  'Hogar',
  'Restaurante',
  'Distribuidor',
  'Importador',
];

/* =========================================================
   UTILIDADES
========================================================= */

const getStoredUsers = (): UserProfile[] => {
  try {
    const saved = localStorage.getItem(USERS_STORAGE_KEY);

    if (!saved) {
      return [];
    }

    const parsed = JSON.parse(saved);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed;
  } catch (error) {
    console.error('Error leyendo usuarios:', error);
    return [];
  }
};

const saveStoredUsers = (users: UserProfile[]) => {
  localStorage.setItem(
    USERS_STORAGE_KEY,
    JSON.stringify(users)
  );
};

const normalizeEmail = (email: string) =>
  email.trim().toLowerCase();

const generateUserId = (role: 'cliente' | 'productor') => {
  const prefix = role === 'productor' ? 'prod' : 'cli';

  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 8)}`;
};

const formatCurrentDate = () => {
  return new Intl.DateTimeFormat('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
};

/* =========================================================
   VALIDACIONES
========================================================= */

const isValidEmail = (email: string) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const isValidPhone = (phone: string) => {
  const numbers = phone.replace(/\D/g, '');

  return numbers.length >= 10 && numbers.length <= 13;
};

const getPasswordStrength = (password: string) => {
  let score = 0;

  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  return score;
};

/* =========================================================
   COMPONENTE PRINCIPAL
========================================================= */

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onLogin,
  onLogout,
  onUpdateProfile,
  initialTab = 'login',
  googleLoginMessage = '',
}) => {
  const [activeAuthPhoto, setActiveAuthPhoto] = useState(0);
  const [activeTab, setActiveTab] = useState<'login' | 'register'>(
    initialTab === 'register' ? 'register' : 'login'
  );

  /* =======================================================
     LOGIN
  ======================================================= */

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);

  const [loginError, setLoginError] = useState('');
  const [loginSuccess, setLoginSuccess] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryRequested, setRecoveryRequested] = useState(false);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState('');

  /* =======================================================
     REGISTRO
  ======================================================= */

  const [registerType, setRegisterType] = useState<
    'buyer' | 'producer'
  >('buyer');
  const [registerStep, setRegisterStep] = useState<1 | 2 | 3>(1);

  const [registerName, setRegisterName] = useState('');
  const [registerGender, setRegisterGender] = useState<'masculino' | 'femenino' | 'neutro' | ''>('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');
  const [registerCity, setRegisterCity] = useState('Montería');

  const [registerBusinessType, setRegisterBusinessType] =
    useState<BusinessType>('Restaurante');

  const [farmName, setFarmName] = useState('');
  const [farmAddress, setFarmAddress] = useState('');
  const [association, setAssociation] = useState('');
  const [producerProducts, setProducerProducts] = useState('');

  const [registerPassword, setRegisterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showRegisterPassword, setShowRegisterPassword] =
    useState(false);

  const [acceptTerms, setAcceptTerms] = useState(false);

  const [registerError, setRegisterError] = useState('');
  const [registerSuccess, setRegisterSuccess] = useState('');

  useEffect(() => {
    if (!isOpen || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const timer = window.setInterval(() => {
      setActiveAuthPhoto((current) => (current + 1) % AUTH_PHOTOS.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [isOpen]);

  /* =======================================================
     EFECTO AL ABRIR
  ======================================================= */

  useEffect(() => {
    if (!isOpen) return;

    setActiveTab(
      initialTab === 'register'
        ? 'register'
        : 'login'
    );

    setLoginError('');
    setLoginSuccess('');
    setRegisterError('');
    setRegisterSuccess('');
    setRegisterStep(1);
    setLoginError(googleLoginMessage);
  }, [isOpen, initialTab, googleLoginMessage]);

  /* =======================================================
     LOGIN
  ======================================================= */

  const handleLogin = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoginError('');
    setLoginSuccess('');

    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail || !password) {
      setLoginError('Completa tu correo electr\u00f3nico y contrase\u00f1a.');
      return;
    }
    if (!isValidEmail(normalizedEmail)) {
      setLoginError('Ingresa un correo electr\u00f3nico v\u00e1lido.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password }),
      });
      const result = await response.json().catch(() => null);
      if (!result) {
        throw new Error('No llegó una respuesta válida de Flask. Comprueba que el backend esté iniciado en el puerto 5000.');
      }
      if (!response.ok) throw new Error(result.error || 'No se pudo iniciar sesi\u00f3n.');
      onLogin(result.user as UserProfile);
      setLoginSuccess('Inicio de sesi\u00f3n exitoso.');
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : 'No se pudo conectar con el servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestRecovery = async (event: React.FormEvent) => {
    event.preventDefault();
    setRecoveryError('');
    setRecoveryMessage('');
    const normalizedEmail = normalizeEmail(recoveryEmail);
    if (!isValidEmail(normalizedEmail)) {
      setRecoveryError('Escribe un correo valido.');
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/password/request-code', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const result = await response.json().catch(() => null);
      if (!result) throw new Error('El servidor no devolvió una respuesta válida.');
      if (!response.ok) throw new Error(result.error || 'No se pudo enviar el código.');
      setRecoveryEmail(normalizedEmail);
      setRecoveryRequested(true);
      setRecoveryMessage(result.message || 'Revisa tu correo para encontrar el código.');
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : 'No se pudo conectar con el servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyRecovery = async (event: React.FormEvent) => {
    event.preventDefault();
    setRecoveryError('');
    if (!/^\d{6}$/.test(recoveryCode)) {
      setRecoveryError('El código debe tener seis dígitos.');
      return;
    }
    if (recoveryPassword.length < 8) {
      setRecoveryError('La contraseña nueva debe tener al menos 8 caracteres.');
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/password/verify-code', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizeEmail(recoveryEmail), code: recoveryCode, password: recoveryPassword }),
      });
      const result = await response.json().catch(() => null);
      if (!result) throw new Error('El servidor no devolvió una respuesta válida.');
      if (!response.ok) throw new Error(result.error || 'No se pudo cambiar la contraseña.');
      setRecoveryOpen(false);
      setRecoveryRequested(false);
      setRecoveryCode('');
      setRecoveryPassword('');
      setRecoveryMessage('');
      setEmail(recoveryEmail);
      setPassword(recoveryPassword);
      setLoginSuccess(result.message || 'Contraseña actualizada. Ya puedes iniciar sesión.');
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : 'No se pudo conectar con el servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  /* =======================================================
     GOOGLE
  ======================================================= */

  const handleGoogleLogin = () => {
    window.location.assign('/auth/google');
  };

  /* =======================================================
     CAMBIAR PESTAÑAS
  ======================================================= */

  const openRegister = () => {
    setLoginError('');
    setLoginSuccess('');
    setRegisterError('');
    setRegisterSuccess('');

    setActiveTab('register');
  };

  const openLogin = () => {
    setLoginError('');
    setLoginSuccess('');
    setRegisterError('');
    setRegisterSuccess('');

    setActiveTab('login');
  };

  /* =======================================================
     CAMBIAR TIPO DE REGISTRO
  ======================================================= */

  const changeRegisterType = (
    type: 'buyer' | 'producer'
  ) => {
    setRegisterType(type);
    setRegisterStep(1);

    setRegisterError('');
    setRegisterSuccess('');

    if (type === 'buyer') {
      setFarmName('');
      setFarmAddress('');
      setAssociation('');
      setProducerProducts('');
    }
  };

  /* =======================================================
     REGISTRO
  ======================================================= */

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();

    setRegisterError('');
    setRegisterSuccess('');

    if (registerStep < 3) {
      if (registerStep === 1) {
        if (registerName.trim().length < 3) {
          setRegisterError('Escribe un nombre de al menos 3 caracteres.');
          return;
        }
        if (!registerGender) {
          setRegisterError('Selecciona si eres mujer u hombre.');
          return;
        }
        if (!isValidPhone(registerPhone.trim())) {
          setRegisterError('Ingresa un número de teléfono válido.');
          return;
        }
        if (!registerCity) {
          setRegisterError('Selecciona tu municipio.');
          return;
        }
      } else if (registerType === 'producer') {
        if (!farmName.trim() || !association.trim() || !producerProducts.trim()) {
          setRegisterError('Completa los datos de tu finca, asociación y productos.');
          return;
        }
      }
      setRegisterStep((step) => (step + 1) as 2 | 3);
      return;
    }

    /* -----------------------------------------------
       CAMPOS BÁSICOS
    ------------------------------------------------ */

    const name = registerName.trim();
    const normalizedEmail =
      normalizeEmail(registerEmail);

    const phone = registerPhone.trim();
    const city = registerCity.trim();

    if (!name) {
      setRegisterError(
        'Ingresa tu nombre completo o nombre de empresa.'
      );
      return;
    }

    if (name.length < 3) {
      setRegisterError(
        'El nombre debe tener al menos 3 caracteres.'
      );
      return;
    }

    if (!registerGender) {
      setRegisterError('Selecciona si eres mujer u hombre.');
      return;
    }

    if (!normalizedEmail) {
      setRegisterError(
        'Ingresa tu correo electrónico.'
      );
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setRegisterError(
        'Ingresa un correo electrónico válido.'
      );
      return;
    }

    if (!phone) {
      setRegisterError(
        'Ingresa tu número de teléfono.'
      );
      return;
    }

    if (!isValidPhone(phone)) {
      setRegisterError(
        'Ingresa un número de teléfono válido.'
      );
      return;
    }

    if (!city) {
      setRegisterError(
        'Selecciona tu municipio.'
      );
      return;
    }

    /* -----------------------------------------------
       VALIDACIONES PRODUCTOR
    ------------------------------------------------ */

    if (registerType === 'producer') {
      if (!farmName.trim()) {
        setRegisterError(
          'Ingresa el nombre de tu finca.'
        );
        return;
      }

      if (!association.trim()) {
        setRegisterError(
          'Indica la asociación a la que perteneces o escribe "Independiente".'
        );
        return;
      }

      if (!producerProducts.trim()) {
        setRegisterError(
          'Indica al menos un producto que produces.'
        );
        return;
      }
    }

    /* -----------------------------------------------
       CONTRASEÑA
    ------------------------------------------------ */

    if (!registerPassword) {
      setRegisterError(
        'Crea una contraseña para tu cuenta.'
      );
      return;
    }

    if (registerPassword.length < 8) {
      setRegisterError(
        'La contraseña debe tener al menos 8 caracteres.'
      );
      return;
    }

    if (getPasswordStrength(registerPassword) < 3) {
      setRegisterError(
        'La contraseña debe combinar letras mayúsculas, minúsculas y números.'
      );
      return;
    }

    if (registerPassword !== confirmPassword) {
      setRegisterError(
        'Las contraseñas no coinciden.'
      );
      return;
    }

    if (!acceptTerms) {
      setRegisterError(
        'Debes aceptar los términos y condiciones para crear la cuenta.'
      );
      return;
    }

    /* -----------------------------------------------
       CORREOS DUPLICADOS
    ------------------------------------------------ */

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          gender: registerGender,
          email: normalizedEmail,
          phone,
          city,
          role: registerType === 'producer' ? 'productor' : 'cliente',
          businessType: registerType === 'producer' ? 'Distribuidor' : registerBusinessType,
          farmName: farmName.trim(),
          farmAddress: farmAddress.trim(),
          association: association.trim(),
          products: producerProducts.split(',').map((product) => product.trim()).filter(Boolean),
          password: registerPassword,
        }),
      });
      let result: { user?: UserProfile; error?: string };
      try {
        result = await response.json() as { user?: UserProfile; error?: string };
      } catch {
        if (!response.ok) {
          throw new Error(
            `No se pudo crear la cuenta (error del servidor ${response.status}). Antes de intentarlo otra vez, prueba iniciar sesión para verificar si ya quedó creada.`
          );
        }
        throw new Error(
          'El servidor respondió en un formato inesperado. Prueba iniciar sesión para verificar si la cuenta ya quedó creada.'
        );
      }
      if (!response.ok) throw new Error(result.error || 'No se pudo crear la cuenta.');
      if (!result.user) {
        throw new Error(
          'El servidor no confirmó la creación de la cuenta. Prueba iniciar sesión antes de repetir el registro.'
        );
      }
      const newUser = result.user;
      setRegisterSuccess(
        registerType === 'producer'
          ? 'Tu solicitud fue registrada. Tu cuenta de productor queda pendiente de validaci\u00f3n.'
          : `Tu cuenta fue creada correctamente. ${registerGender === 'femenino' ? 'Bienvenida' : registerGender === 'masculino' ? 'Bienvenido' : 'Te damos la bienvenida'} a AgroC\u00f3rdoba.`
      );
      onLogin(newUser);
    } catch (error) {
      setRegisterError(error instanceof Error ? error.message : 'No se pudo conectar con el servidor.');
    } finally {
      setIsLoading(false);
    }
  };

  /* =======================================================
     SI MODAL CERRADO
  ======================================================= */

  if (!isOpen) return null;

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div
      className="
        fixed
        inset-0
        z-[9999]
        overflow-y-auto
        bg-black/60
        backdrop-blur-sm
      "
    >
      <div
        className="
          min-h-screen
          w-full
          flex
          items-start
          justify-center
          p-0
          md:p-6
          lg:p-10
        "
      >
        <div
          className="
            relative
            w-full
            max-w-[1450px]
            min-h-screen
            md:min-h-[820px]
            lg:h-[calc(100vh-5rem)]
            lg:min-h-[720px]
            lg:max-h-[900px]
            overflow-hidden
            rounded-none
            md:rounded-[30px]
            bg-white
            shadow-[0_30px_100px_rgba(0,0,0,0.35)]
            flex
            flex-col
            lg:flex-row
          "
        >
          {/* =====================================================
              CERRAR
          ====================================================== */}

          <button
            onClick={onClose}
            className="
              absolute
              right-5
              top-5
              z-[100]
              flex
              h-11
              w-11
              items-center
              justify-center
              rounded-full
              bg-white/95
              text-slate-600
              shadow-lg
              transition-all
              duration-300
              hover:scale-105
              hover:bg-white
              hover:text-green-700
            "
            aria-label="Cerrar"
          >
            <X size={21} />
          </button>

          {/* =====================================================
              PANEL IZQUIERDO
          ====================================================== */}

          <section
            className="
              relative
              hidden
              min-h-[820px]
              lg:min-h-0
              overflow-hidden
              lg:flex
              lg:w-[52%]
              xl:w-[55%]
              flex-col
              justify-between
              bg-[#075b3d]
            "
          >
            {AUTH_PHOTOS.map((photo, index) => (
              <img
                key={photo.src}
                src={photo.src}
                alt=""
                aria-hidden="true"
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${index === activeAuthPhoto ? 'auth-photo-drift opacity-100' : 'opacity-0'}`}
              />
            ))}

            <div
              className="
                absolute
                inset-0
                bg-gradient-to-t
                from-[#013b29]
                via-[#075b3d]/40
                to-black/5
              "
            />

            <div
              className="
                absolute
                inset-0
                bg-gradient-to-r
                from-[#013b29]/60
                via-transparent
                to-transparent
              "
            />

            {/* CONTENIDO */}

            <div
              className="
                relative
                z-10
                flex
                h-full
                flex-col
                justify-between
                p-8
                xl:p-12
              "
            >
              {/* LOGO */}

              <div>
                <div className="flex items-center gap-3">
                  <div
                    className="
                      flex
                      h-12
                      w-12
                      items-center
                      justify-center
                      rounded-2xl
                      bg-white
                      shadow-lg
                    "
                  >
                    <Leaf
                      size={27}
                      className="text-green-700"
                    />
                  </div>

                  <div>
                    <h2
                      className="
                        font-editorial
                        text-2xl
                        font-semibold
                        tracking-[-0.03em]
                        text-white
                      "
                    >
                      Agro
                      <span className="text-green-300">
                        Córdoba
                      </span>
                    </h2>

                    <p
                      className="
                        text-[9px]
                        font-bold
                        tracking-[0.3em]
                        text-white/75
                      "
                    >
                      CONECTANDO CAMPO Y CIUDAD
                    </p>
                  </div>
                </div>
              </div>

              {/* HERO */}

              <div className="max-w-[650px] pb-4">
                <div
                  className="
                    mb-5
                    inline-flex
                    items-center
                    gap-2
                    rounded-full
                    border
                    border-white/20
                    bg-white/15
                    px-4
                    py-2
                    backdrop-blur-md
                  "
                >
                  <span
                    className="
                      h-2.5
                      w-2.5
                      rounded-full
                      bg-lime-300
                      animate-pulse
                    "
                  />

                  <span className="text-sm font-semibold text-white">
                    Mercado campesino digital
                  </span>
                </div>

                <h1
                  className="
                    font-editorial
                    text-6xl
                    font-medium
                    leading-[0.98]
                    tracking-[-0.035em]
                    text-white
                    xl:text-7xl
                  "
                >
                  El campo de
                  <br />

                  <span className="text-green-300">
                    Córdoba
                  </span>

                  <br />

                  más cerca de ti.
                </h1>

                <div className="my-5 h-1 w-16 rounded-full bg-green-300" />

                <p
                  className="
                    max-w-[570px]
                    text-lg
                    leading-8
                    text-white/85
                  "
                >
                  Compra directamente a productores
                  campesinos, conoce sus productos y
                  fortalece la economía rural de nuestro
                  departamento.
                </p>

                <div
                  className="
                    mt-8
                    grid
                    max-w-[650px]
                    grid-cols-2
                    gap-4
                    xl:grid-cols-4
                  "
                >
                  <Feature
                    icon={<Leaf size={21} />}
                    text="Productos del campo"
                  />

                  <Feature
                    icon={<ShoppingCart size={21} />}
                    text="Cotizaciones"
                  />

                  <Feature
                    icon={<Users size={21} />}
                    text="Conexión directa"
                  />

                  <Feature
                    icon={<ShieldCheck size={21} />}
                    text="Comercio local"
                  />
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-5">
                  <div className="flex items-center gap-2" role="group" aria-label="Fotografías del campo">
                    {AUTH_PHOTOS.map((photo, index) => (
                      <button
                        key={photo.src}
                        type="button"
                        onClick={() => setActiveAuthPhoto(index)}
                        aria-label={`Mostrar foto: ${photo.label}`}
                        aria-pressed={index === activeAuthPhoto}
                        className={`h-2 rounded-full border border-white/80 transition-all ${index === activeAuthPhoto ? 'w-7 bg-[#e8fe85]' : 'w-2 bg-white/55 hover:bg-white'}`}
                      />
                    ))}
                  </div>

                  <div className="flex items-center gap-3">
                    <div
                      className="
                        flex
                        h-10
                        w-10
                        items-center
                        justify-center
                        rounded-full
                        bg-white
                        text-green-700
                        shadow-lg
                      "
                    >
                      <Leaf size={18} />
                    </div>

                    <div className="hidden sm:block">
                      <p className="text-xs font-medium text-white/75">
                        Cosechas de nuestra tierra
                      </p>

                      <div
                        className="
                          mt-1
                          h-1
                          w-48
                          overflow-hidden
                          rounded-full
                          bg-white/20
                        "
                      >
                        <div
                          className="
                            h-full
                            w-[65%]
                            rounded-full
                            bg-green-300
                          "
                        />
                      </div>
                    </div>
                  </div>

                  <div
                    className="
                      flex
                      items-center
                      gap-2
                      rounded-full
                      border
                      border-white/20
                      bg-white/15
                      px-4
                      py-2
                      backdrop-blur-md
                    "
                  >
                    <MapPin
                      size={18}
                      className="text-green-300"
                    />

                    <div>
                      <p className="text-xs font-bold text-white">
                        Córdoba, Colombia
                      </p>

                      <p className="text-[10px] text-white/70">
                        tierra que produce futuro
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <p className="absolute bottom-3 left-8 z-10 text-[10px] text-white/70 xl:left-12">
              Fotografía: {AUTH_PHOTOS[activeAuthPhoto].source ? (
                <a href={AUTH_PHOTOS[activeAuthPhoto].source} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-white">{AUTH_PHOTOS[activeAuthPhoto].credit}</a>
              ) : AUTH_PHOTOS[activeAuthPhoto].credit}
            </p>
          </section>

          <div className="relative h-44 shrink-0 overflow-hidden bg-[#07503f] lg:hidden">
            <img
              key={`mobile-${AUTH_PHOTOS[activeAuthPhoto].src}`}
              src={AUTH_PHOTOS[activeAuthPhoto].src}
              alt=""
              aria-hidden="true"
              className="auth-photo-drift absolute inset-0 h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#052d23]/85 via-[#07503f]/50 to-transparent" />
            <div className="relative z-10 flex h-full flex-col justify-end p-6 text-white">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#e8fe85]">Mercado campesino digital</p>
              <AgroCordobaBrand theme="dark" compact subtitle="" />
              {AUTH_PHOTOS[activeAuthPhoto].source ? (
                <a href={AUTH_PHOTOS[activeAuthPhoto].source} target="_blank" rel="noreferrer" className="mt-1 w-fit text-[10px] text-white/70 underline underline-offset-2">Foto: {AUTH_PHOTOS[activeAuthPhoto].credit}</a>
              ) : <span className="mt-1 text-[10px] text-white/70">Foto: {AUTH_PHOTOS[activeAuthPhoto].credit}</span>}
            </div>
          </div>

          {/* =====================================================
              PANEL DERECHO
          ====================================================== */}

          <section
            className="
              relative
              flex
              min-h-screen
              lg:min-h-0
              w-full
              flex-1
              flex-col
              overflow-y-auto
              bg-white
              lg:min-h-[820px]
            "
          >
            {/* DECORACIÓN */}

            <div
              className="
                pointer-events-none
                absolute
                right-0
                top-0
                h-44
                w-44
                overflow-hidden
              "
            >
              <div
                className="
                  absolute
                  -right-16
                  -top-16
                  h-40
                  w-40
                  rounded-full
                  bg-green-50
                "
              />

              <Leaf
                size={75}
                className="
                  absolute
                  right-3
                  top-4
                  rotate-[35deg]
                  text-green-200
                "
              />
            </div>

            <div
              className="
                relative
                z-10
                mx-auto
                w-full
                max-w-[620px]
                px-6
                py-10
                sm:px-10
                md:py-14
                lg:px-14
              "
            >
              {/* =================================================
                  USUARIO LOGUEADO
              ================================================== */}

              {currentUser ? (
                <LoggedUser
                  currentUser={currentUser}
                  onLogout={onLogout}
                  onUpdateProfile={onUpdateProfile}
                />
              ) : (
                <>
                  {/* =================================================
                      LOGIN
                  ================================================== */}

                  {activeTab === 'login' && (
                    <div>
                      <div className="mb-9">
                        <div className="mb-5">
                            <p
                              className="
                                text-[10px]
                                font-bold
                                tracking-[0.28em]
                                text-slate-400
                              "
                            >
                              TE DAMOS LA BIENVENIDA
                            </p>
                          <AgroCordobaBrand compact subtitle="" />
                        </div>

                        <h1
                          className="
                            font-editorial
                            text-5xl
                            font-medium
                            tracking-[-0.03em]
                            text-green-950
                          "
                        >
                          Inicia sesión
                        </h1>

                        <p
                          className="
                            mt-3
                            max-w-md
                            text-base
                            leading-7
                            text-slate-500
                          "
                        >
                          Accede a tu cuenta y continúa
                          conectándote con el campo cordobés.
                        </p>
                      </div>

                      {recoveryOpen && (
                        <form onSubmit={recoveryRequested ? handleVerifyRecovery : handleRequestRecovery} className="mb-6 rounded-2xl border border-green-100 bg-green-50/70 p-5">
                          <div className="mb-4 flex items-start justify-between gap-3">
                            <div>
                              <h2 className="font-bold text-green-950">Recupera tu contrase&ntilde;a</h2>
                              <p className="mt-1 text-sm text-slate-600">Te enviaremos un c&oacute;digo de verificaci&oacute;n a tu correo.</p>
                            </div>
                            <button type="button" onClick={() => { setRecoveryOpen(false); setRecoveryRequested(false); setRecoveryCode(''); setRecoveryPassword(''); setRecoveryError(''); setRecoveryMessage(''); }} className="text-sm font-semibold text-green-800 hover:text-green-950">Volver</button>
                          </div>
                          <label className="mb-1 block text-sm font-semibold text-slate-700">Correo electr&oacute;nico</label>
                          <input type="email" required readOnly={recoveryRequested} value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} className="mb-3 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 read-only:bg-slate-100" placeholder="tucorreo@ejemplo.com" />
                          {recoveryRequested && (
                            <>
                              <label className="mb-1 block text-sm font-semibold text-slate-700">C&oacute;digo de seis d&iacute;gitos</label>
                              <input inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={6} pattern="\d{6}" required value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value.replace(/\D/g, ''))} className="mb-3 h-12 w-full rounded-xl border border-slate-200 bg-white px-4" placeholder="000000" />
                              <label className="mb-1 block text-sm font-semibold text-slate-700">Nueva contrase&ntilde;a</label>
                              <input type="password" required minLength={8} value={recoveryPassword} onChange={(event) => setRecoveryPassword(event.target.value)} className="mb-3 h-12 w-full rounded-xl border border-slate-200 bg-white px-4" placeholder="Al menos 8 caracteres" />
                            </>
                          )}
                          {recoveryError && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{recoveryError}</p>}
                          {recoveryMessage && <p role="status" className="mb-3 rounded-lg bg-white p-3 text-sm text-green-800">{recoveryMessage}</p>}
                          <button type="submit" disabled={isLoading} className="w-full rounded-xl bg-green-800 px-4 py-3 font-semibold text-white hover:bg-green-900 disabled:opacity-60">
                            {isLoading ? 'Procesando...' : recoveryRequested ? 'Cambiar contraseña' : 'Enviar código'}
                          </button>
                        </form>
                      )}
                      <form onSubmit={handleLogin} className={recoveryOpen ? 'hidden' : ''}>
                        {/* CORREO */}

                        <label
                          className="
                            mb-2
                            block
                            text-sm
                            font-bold
                            text-slate-700
                          "
                        >
                          Correo electrónico
                        </label>

                        <div className="relative mb-6">
                          <Mail
                            size={20}
                            className="
                              absolute
                              left-4
                              top-1/2
                              -translate-y-1/2
                              text-slate-400
                            "
                          />

                          <input
                            type="email"
                            value={email}
                            onChange={(e) =>
                              setEmail(e.target.value)
                            }
                            placeholder="tucorreo@ejemplo.com"
                            className="
                              h-14
                              w-full
                              rounded-2xl
                              border
                              border-slate-200
                              bg-slate-50
                              pl-12
                              pr-4
                              text-[15px]
                              text-slate-800
                              outline-none
                              transition
                              focus:border-green-500
                              focus:bg-white
                              focus:ring-4
                              focus:ring-green-100
                            "
                          />
                        </div>

                        {/* PASSWORD */}

                        <div className="mb-2 flex items-center justify-between">
                          <label
                            className="
                              text-sm
                              font-bold
                              text-slate-700
                            "
                          >
                            Contraseña
                          </label>

                          <button
                            type="button"
                            onClick={() => {
                              setRecoveryEmail(email);
                              setRecoveryRequested(false);
                              setRecoveryCode('');
                              setRecoveryPassword('');
                              setRecoveryError('');
                              setRecoveryMessage('');
                              setRecoveryOpen(true);
                            }}
                            className="
                              text-sm
                              font-semibold
                              text-green-700
                              hover:text-green-800
                            "
                          >
                            ¿Olvidaste tu contraseña?
                          </button>
                        </div>

                        <div className="relative">
                          <Lock
                            size={20}
                            className="
                              absolute
                              left-4
                              top-1/2
                              -translate-y-1/2
                              text-slate-400
                            "
                          />

                          <input
                            type={
                              showPassword
                                ? 'text'
                                : 'password'
                            }
                            value={password}
                            onChange={(e) =>
                              setPassword(e.target.value)
                            }
                            placeholder="••••••••"
                            className="
                              h-14
                              w-full
                              rounded-2xl
                              border
                              border-slate-200
                              bg-slate-50
                              pl-12
                              pr-14
                              text-[15px]
                              text-slate-800
                              outline-none
                              transition
                              focus:border-green-500
                              focus:bg-white
                              focus:ring-4
                              focus:ring-green-100
                            "
                          />

                          <button
                            type="button"
                            onClick={() =>
                              setShowPassword(
                                !showPassword
                              )
                            }
                            className="
                              absolute
                              right-4
                              top-1/2
                              -translate-y-1/2
                              text-slate-400
                              transition
                              hover:text-green-700
                            "
                          >
                            {showPassword ? (
                              <EyeOff size={20} />
                            ) : (
                              <Eye size={20} />
                            )}
                          </button>
                        </div>

                        {/* ERROR */}

                        {loginError && (
                          <MessageBox
                            type="error"
                            message={loginError}
                          />
                        )}

                        {loginSuccess && (
                          <MessageBox
                            type="success"
                            message={loginSuccess}
                          />
                        )}

                        {/* LOGIN */}

                        <button
                          type="submit"
                          disabled={isLoading}
                          className="
                            group
                            mt-6
                            flex
                            h-14
                            w-full
                            items-center
                            justify-center
                            gap-3
                            rounded-2xl
                            bg-green-800
                            text-base
                            font-bold
                            text-white
                            shadow-[0_10px_25px_rgba(5,92,60,0.22)]
                            transition-all
                            duration-300
                            hover:-translate-y-0.5
                            hover:bg-green-900
                            disabled:cursor-not-allowed
                            disabled:opacity-60
                          "
                        >
                          {isLoading ? (
                            <>
                              <span
                                className="
                                  h-5
                                  w-5
                                  animate-spin
                                  rounded-full
                                  border-2
                                  border-white/30
                                  border-t-white
                                "
                              />

                              Verificando...
                            </>
                          ) : (
                            <>
                              Iniciar sesión

                              <ArrowRight
                                size={21}
                                className="
                                  transition-transform
                                  group-hover:translate-x-1
                                "
                              />
                            </>
                          )}
                        </button>
                      </form>

                      {/* GOOGLE */}

                      <div className="my-7 flex items-center gap-4">
                        <div className="h-px flex-1 bg-slate-200" />

                        <span
                          className="
                            text-xs
                            font-semibold
                            text-slate-400
                          "
                        >
                          o continúa con
                        </span>

                        <div className="h-px flex-1 bg-slate-200" />
                      </div>

                      <button
                        type="button"
                        onClick={handleGoogleLogin}
                        className="
                          flex
                          h-14
                          w-full
                          items-center
                          justify-center
                          gap-3
                          rounded-2xl
                          border
                          border-slate-200
                          bg-white
                          font-semibold
                          text-slate-700
                          transition
                          hover:border-slate-300
                          hover:bg-slate-50
                        "
                      >
                        <svg className="h-5 w-5" viewBox="0 0 48 48" role="img" aria-label="Google">
                          <path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.2H24v7.9h11c-.5 2.5-1.9 4.7-4.1 6.1v5.2h6.7c3.9-3.6 6-8.8 6-15z" />
                          <path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.9l-6.7-5.2c-1.8 1.2-4.1 1.9-6.8 1.9-5.2 0-9.5-3.5-11.1-8.2H6v5.4C9.5 39.6 16.2 44 24 44z" />
                          <path fill="#FBBC05" d="M12.9 27.6a12 12 0 0 1 0-7.2V15H6a20 20 0 0 0 0 18z" />
                          <path fill="#EA4335" d="M24 12.2c3 0 5.7 1 7.8 3.1l5.9-5.9C34.1 6 29.5 4 24 4 16.2 4 9.5 8.4 6 15l6.9 5.4c1.6-4.7 5.9-8.2 11.1-8.2z" />
                        </svg>

                        Continuar con Google
                      </button>

                      {/* REGISTRO */}

                      <p
                        className="
                          mt-7
                          text-center
                          text-sm
                          text-slate-500
                        "
                      >
                        ¿Aún no tienes una cuenta?

                        <button
                          type="button"
                          onClick={openRegister}
                          className="
                            ml-1
                            font-bold
                            text-green-700
                            hover:text-green-900
                          "
                        >
                          Crear cuenta
                        </button>
                      </p>

                    </div>
                  )}

                  {/* =================================================
                      REGISTRO
                  ================================================== */}

                  {activeTab === 'register' && (
                    <form
                      onSubmit={handleRegister}
                      className="pt-4"
                    >
                      {/* VOLVER */}

                      <button
                        type="button"
                        onClick={openLogin}
                        className="
                          mb-7
                          flex
                          items-center
                          gap-2
                          text-sm
                          font-semibold
                          text-slate-500
                          transition
                          hover:text-green-700
                        "
                      >
                        ← Volver al inicio de sesión
                      </button>

                      {/* TITULO */}

                      <div className="mb-8">
                        <span
                          className="
                            inline-flex
                            items-center
                            gap-2
                            rounded-full
                            bg-green-50
                            px-4
                            py-2
                            text-sm
                            font-semibold
                            text-green-700
                          "
                        >
                          <UserPlus size={17} />

                          Crear cuenta
                        </span>

                        <h1
                          className="
                            mt-5
                            font-editorial
                            text-5xl
                            font-medium
                            tracking-[-0.03em]
                            text-green-950
                          "
                        >
                          Únete a AgroCórdoba
                        </h1>

                        <p className="mt-3 text-slate-500">
                          Crea tu cuenta según la forma en
                          que participarás en el mercado
                          campesino digital.
                        </p>
                      </div>

                      {/* TIPO DE CUENTA */}

                      <div className="grid gap-4 sm:grid-cols-2">
                        <RegisterTypeCard
                          active={
                            registerType === 'buyer'
                          }
                          icon={
                            <ShoppingCart size={23} />
                          }
                          title="Soy comprador"
                          description="Quiero comprar productos directamente a productores."
                          onClick={() =>
                            changeRegisterType('buyer')
                          }
                        />

                        <RegisterTypeCard
                          active={
                            registerType === 'producer'
                          }
                          icon={<Sprout size={23} />}
                          title="Soy productor"
                          description="Quiero publicar mis productos y conectar con compradores."
                          onClick={() =>
                            changeRegisterType(
                              'producer'
                            )
                          }
                        />
                      </div>

                      <ol className="mt-7 grid grid-cols-3 gap-2" aria-label="Pasos para crear tu cuenta">
                        {[
                          { step: 1, label: 'Información básica' },
                          { step: 2, label: registerType === 'buyer' ? 'Negocio' : 'Finca' },
                          { step: 3, label: 'Acceso' },
                        ].map(({ step, label }) => (
                          <li key={step} className="min-w-0">
                            <div className={`h-1.5 rounded-full ${registerStep >= step ? 'bg-green-700' : 'bg-slate-200'}`} />
                            <p className={`mt-2 truncate text-[11px] font-semibold ${registerStep === step ? 'text-green-800' : 'text-slate-400'}`}>
                              {step}. {label}
                            </p>
                          </li>
                        ))}
                      </ol>

                      <div className="mt-7 space-y-5">
                        {registerStep === 1 && (
                          <>
                        <SectionTitle
                          number="01"
                          title={
                            registerType === 'buyer'
                              ? 'Información del comprador'
                              : 'Información del productor'
                          }
                        />

                        {/* NOMBRE */}

                        <InputField
                          label={
                            registerType === 'buyer'
                              ? 'Nombre o empresa'
                              : 'Nombre completo'
                          }
                          placeholder={
                            registerType === 'buyer'
                              ? 'Ej. Restaurante Sabores del Sinú'
                              : 'Ej. Juan Pérez'
                          }
                          value={registerName}
                          onChange={setRegisterName}
                          icon={<User size={19} />}
                          required
                        />

                        {/* GÉNERO PARA EL SALUDO */}
                        <div>
                          <label className="mb-2 block text-sm font-bold text-slate-700">
                            ¿Eres mujer u hombre?
                          </label>
                          <div className="relative">
                            <User size={19} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                            <select
                              value={registerGender}
                              onChange={(e) => setRegisterGender(e.target.value as 'masculino' | 'femenino' | 'neutro' | '')}
                              className="h-14 w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50 pl-12 pr-10 outline-none transition focus:border-green-500 focus:bg-white focus:ring-4 focus:ring-green-100"
                            >
                              <option value="">Selecciona una opción</option>
                              <option value="femenino">Mujer</option>
                              <option value="masculino">Hombre</option>
                            </select>
                            <ChevronDown size={18} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-slate-400" />
                          </div>
                        </div>

                        {/* TELEFONO */}

                        <InputField
                          label="Número de teléfono"
                          placeholder="+57 300 000 0000"
                          type="tel"
                          value={registerPhone}
                          onChange={setRegisterPhone}
                          icon={<Phone size={19} />}
                          required
                        />

                        {/* MUNICIPIO */}

                        <div>
                          <label className="mb-2 block text-sm font-bold text-slate-700">
                            Municipio
                          </label>

                          <div className="relative">
                            <MapPin
                              size={19}
                              className="
                                absolute
                                left-4
                                top-1/2
                                -translate-y-1/2
                                text-slate-400
                              "
                            />

                            <select
                              value={registerCity}
                              onChange={(e) =>
                                setRegisterCity(
                                  e.target.value
                                )
                              }
                              className="
                                h-14
                                w-full
                                appearance-none
                                rounded-2xl
                                border
                                border-slate-200
                                bg-slate-50
                                pl-12
                                pr-10
                                outline-none
                                transition
                                focus:border-green-500
                                focus:bg-white
                                focus:ring-4
                                focus:ring-green-100
                              "
                            >
                              {MUNICIPALITIES.map(
                                (municipality) => (
                                  <option
                                    key={municipality}
                                    value={municipality}
                                  >
                                    {municipality}
                                  </option>
                                )
                              )}
                            </select>

                            <ChevronDown
                              size={18}
                              className="
                                absolute
                                right-4
                                top-1/2
                                -translate-y-1/2
                                text-slate-400
                                pointer-events-none
                              "
                            />
                          </div>
                        </div>
                          </>
                        )}

                        {registerStep === 2 && (
                          <>
                        <SectionTitle
                          number="02"
                          title={registerType === 'buyer' ? 'Información del negocio' : 'Información productiva'}
                        />

                        {/* COMPRADOR */}
                        {registerType === 'buyer' && (
                          <div>
                            <label className="mb-2 block text-sm font-bold text-slate-700">
                              Tipo de negocio
                            </label>

                            <div className="relative">
                              <Building2
                                size={19}
                                className="
                                  absolute
                                  left-4
                                  top-1/2
                                  -translate-y-1/2
                                  text-slate-400
                                "
                              />

                              <select
                                value={
                                  registerBusinessType
                                }
                                onChange={(e) =>
                                  setRegisterBusinessType(
                                    e.target
                                      .value as BusinessType
                                  )
                                }
                                className="
                                  h-14
                                  w-full
                                  appearance-none
                                  rounded-2xl
                                  border
                                  border-slate-200
                                  bg-slate-50
                                  pl-12
                                  pr-10
                                  outline-none
                                  transition
                                  focus:border-green-500
                                  focus:bg-white
                                  focus:ring-4
                                  focus:ring-green-100
                                "
                              >
                                {BUSINESS_TYPES.map(
                                  (business) => (
                                    <option
                                      key={business}
                                      value={business}
                                    >
                                      {business}
                                    </option>
                                  )
                                )}
                              </select>

                              <ChevronDown
                                size={18}
                                className="
                                  absolute
                                  right-4
                                  top-1/2
                                  -translate-y-1/2
                                  text-slate-400
                                  pointer-events-none
                                "
                              />
                            </div>
                          </div>
                        )}

                        {/* PRODUCTOR */}

                        {registerType === 'producer' && (
                          <>
                            <InputField
                              label="Nombre de la finca"
                              placeholder="Ej. Finca La Esperanza"
                              value={farmName}
                              onChange={setFarmName}
                              icon={<Store size={19} />}
                              required
                            />

                            <label className="block text-sm font-bold text-slate-700">
                              Dirección privada para recogida (opcional)
                              <input
                                type="text"
                                maxLength={500}
                                autoComplete="street-address"
                                value={farmAddress}
                                onChange={(event) => setFarmAddress(event.target.value)}
                                placeholder="Dirección de la finca o punto de recogida"
                                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-normal text-slate-800"
                              />
                              <span className="mt-1 block text-xs font-normal text-slate-500">
                                No se publica; solo se comparte con el comprador tras acordar una recogida.
                              </span>
                            </label>

                            <InputField
                              label="Asociación"
                              placeholder="Ej. Asociación Campesina de Cereté"
                              value={association}
                              onChange={setAssociation}
                              icon={<Users size={19} />}
                              required
                            />

                            <div>
                              <label className="mb-2 block text-sm font-bold text-slate-700">
                                Productos que produces
                              </label>

                              <textarea
                                value={
                                  producerProducts
                                }
                                onChange={(e) =>
                                  setProducerProducts(
                                    e.target.value
                                  )
                                }
                                placeholder="Ej. Yuca, ñame, plátano, cacao"
                                rows={3}
                                className="
                                  w-full
                                  resize-none
                                  rounded-2xl
                                  border
                                  border-slate-200
                                  bg-slate-50
                                  px-4
                                  py-4
                                  outline-none
                                  transition
                                  focus:border-green-500
                                  focus:bg-white
                                  focus:ring-4
                                  focus:ring-green-100
                                "
                              />

                              <p className="mt-2 text-xs text-slate-400">
                                Separa los productos con comas.
                              </p>
                            </div>
                          </>
                        )}
                          </>
                        )}

                        {registerStep === 3 && (
                          <>
                        <SectionTitle number="03" title="Información de acceso" />

                        <InputField
                          label="Correo electrónico"
                          placeholder="tucorreo@ejemplo.com"
                          type="email"
                          value={registerEmail}
                          onChange={setRegisterEmail}
                          icon={<Mail size={19} />}
                          required
                        />

                        {/* SEGURIDAD */}

                        <div>
                          <label className="mb-2 block text-sm font-bold text-slate-700">
                            Contraseña
                          </label>

                          <div className="relative">
                            <Lock
                              size={19}
                              className="
                                absolute
                                left-4
                                top-1/2
                                -translate-y-1/2
                                text-slate-400
                              "
                            />

                            <input
                              type={
                                showRegisterPassword
                                  ? 'text'
                                  : 'password'
                              }
                              value={
                                registerPassword
                              }
                              onChange={(e) =>
                                setRegisterPassword(
                                  e.target.value
                                )
                              }
                              placeholder="Crea una contraseña segura"
                              className="
                                h-14
                                w-full
                                rounded-2xl
                                border
                                border-slate-200
                                bg-slate-50
                                pl-12
                                pr-14
                                outline-none
                                transition
                                focus:border-green-500
                                focus:bg-white
                                focus:ring-4
                                focus:ring-green-100
                              "
                            />

                            <button
                              type="button"
                              onClick={() =>
                                setShowRegisterPassword(
                                  !showRegisterPassword
                                )
                              }
                              className="
                                absolute
                                right-4
                                top-1/2
                                -translate-y-1/2
                                text-slate-400
                                hover:text-green-700
                              "
                            >
                              {showRegisterPassword ? (
                                <EyeOff size={19} />
                              ) : (
                                <Eye size={19} />
                              )}
                            </button>
                          </div>

                          {/* FUERZA */}

                          {registerPassword && (
                            <div className="mt-3">
                              <div className="mb-2 flex gap-1">
                                {[1, 2, 3, 4, 5].map(
                                  (level) => (
                                    <div
                                      key={level}
                                      className={`
                                        h-1.5
                                        flex-1
                                        rounded-full
                                        ${
                                          getPasswordStrength(
                                            registerPassword
                                          ) >= level
                                            ? 'bg-green-600'
                                            : 'bg-slate-200'
                                        }
                                      `}
                                    />
                                  )
                                )}
                              </div>

                              <p className="text-xs text-slate-500">
                                Usa mínimo 8 caracteres,
                                mayúsculas, minúsculas y
                                números.
                              </p>
                            </div>
                          )}
                        </div>

                        {/* CONFIRMAR */}

                        <InputField
                          label="Confirmar contraseña"
                          placeholder="Repite tu contraseña"
                          type="password"
                          value={confirmPassword}
                          onChange={setConfirmPassword}
                          icon={<Lock size={19} />}
                          required
                        />

                        {/* TERMINOS */}

                        <label className="flex cursor-pointer items-start gap-3">
                          <input
                            type="checkbox"
                            checked={acceptTerms}
                            onChange={(e) =>
                              setAcceptTerms(
                                e.target.checked
                              )
                            }
                            className="
                              mt-1
                              h-4
                              w-4
                              accent-green-700
                            "
                          />

                          <span className="text-xs leading-5 text-slate-500">
                            Acepto los términos de uso y la
                            política de privacidad de
                            AgroCórdoba y autorizo el
                            tratamiento de mis datos para la
                            gestión de mi cuenta.
                          </span>
                        </label>

                        {/* ERROR */}

                        {registerError && (
                          <MessageBox
                            type="error"
                            message={registerError}
                          />
                        )}

                        {/* SUCCESS */}

                        {registerSuccess && (
                          <MessageBox
                            type="success"
                            message={registerSuccess}
                          />
                        )}
                          </>
                        )}

                        {/* CREAR */}

                        <button
                          type="submit"
                          disabled={isLoading}
                          className="
                            group
                            flex
                            h-14
                            w-full
                            items-center
                            justify-center
                            gap-3
                            rounded-2xl
                            bg-green-800
                            font-bold
                            text-white
                            shadow-[0_10px_25px_rgba(5,92,60,0.22)]
                            transition-all
                            hover:-translate-y-0.5
                            hover:bg-green-900
                          "
                        >
                          {registerStep === 3
                            ? isLoading ? 'Creando cuenta...' : 'Crear mi cuenta'
                            : 'Continuar'}

                          <ArrowRight
                            size={20}
                            className="
                              transition-transform
                              group-hover:translate-x-1
                            "
                          />
                        </button>

                        <div className="flex items-center justify-between">
                          {registerStep > 1 ? (
                            <button type="button" onClick={() => { setRegisterError(''); setRegisterStep((step) => (step - 1) as 1 | 2); }} className="text-sm font-semibold text-slate-500 hover:text-green-800">
                              Volver
                            </button>
                          ) : <span />}
                          {registerStep === 3 && (
                            <p className="text-right text-xs leading-5 text-slate-400">
                              {registerType === 'producer'
                                ? 'Tu cuenta de productor quedará pendiente de validación.'
                                : 'Revisa tus datos antes de crear la cuenta.'}
                            </p>
                          )}
                        </div>
                      </div>
                    </form>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* =========================================================
          ANIMACIONES
      ========================================================== */}

      <style>
        {`
          @keyframes agroZoom {
            0% {
              transform: scale(1.03);
            }

            100% {
              transform: scale(1.10);
            }
          }

          @keyframes authPhotoDrift {
            from { transform: scale(1.01); }
            to { transform: scale(1.04) translate3d(-0.2%, -0.15%, 0); }
          }

          @keyframes agroLeaf {
            0% {
              transform: translateY(0px) rotate(-10deg);
            }

            50% {
              transform: translateY(-16px) rotate(8deg);
            }

            100% {
              transform: translateY(0px) rotate(-10deg);
            }
          }

          @keyframes agroLeafReverse {
            0% {
              transform: translateY(0px) rotate(20deg);
            }

            50% {
              transform: translateY(15px) rotate(40deg);
            }

            100% {
              transform: translateY(0px) rotate(20deg);
            }
          }

          @keyframes agroLeafSlow {
            0% {
              transform: translateY(0px) rotate(60deg);
            }

            50% {
              transform: translateY(-10px) rotate(80deg);
            }

            100% {
              transform: translateY(0px) rotate(60deg);
            }
          }

          .animate-agro-zoom {
            animation: agroZoom 18s ease-in-out infinite alternate;
          }

          .auth-photo-drift {
            animation: authPhotoDrift 4.2s ease-out forwards;
          }

          @media (prefers-reduced-motion: reduce) {
            .auth-photo-drift { animation: none; }
          }

          .animate-agro-leaf {
            animation: agroLeaf 6s ease-in-out infinite;
          }

          .animate-agro-leaf-reverse {
            animation: agroLeafReverse 7s ease-in-out infinite;
          }

          .animate-agro-leaf-slow {
            animation: agroLeafSlow 8s ease-in-out infinite;
          }
        `}
      </style>
    </div>
  );
};

/* =========================================================
   USUARIO LOGUEADO
========================================================= */

const LoggedUser: React.FC<{
  currentUser: UserProfile;
  onLogout: () => void;
  onUpdateProfile: (
    updated: Partial<UserProfile>
  ) => void;
}> = ({
  currentUser,
  onLogout,
  onUpdateProfile,
}) => {
  const roleLabel =
    currentUser.role === 'admin'
      ? 'Administrador'
      : currentUser.role === 'productor'
      ? 'Productor campesino'
      : 'Comprador';

  const roleColor =
    currentUser.role === 'admin'
      ? 'bg-blue-50 text-blue-700'
      : currentUser.role === 'productor'
      ? 'bg-amber-50 text-amber-700'
      : 'bg-green-50 text-green-700';

  return (
    <div className="pt-8">
      <div className="mb-8">
        <span
          className="
            inline-flex
            items-center
            gap-2
            rounded-full
            bg-green-50
            px-4
            py-2
            text-sm
            font-semibold
            text-green-700
          "
        >
          <CheckCircle2 size={17} />

          Sesión iniciada
        </span>
      </div>

      <h2
        className="
          text-4xl
          font-black
          tracking-tight
          text-green-950
        "
      >
        ¡Hola, {currentUser.name.split(' ')[0]}!
      </h2>

      <p className="mt-3 text-slate-500">
        {currentUser.gender === 'femenino' ? 'Bienvenida nuevamente' : currentUser.gender === 'masculino' ? 'Bienvenido nuevamente' : 'Te damos la bienvenida de nuevo'} a AgroCórdoba.
      </p>

      <div
        className="
          mt-8
          rounded-3xl
          border
          border-green-100
          bg-green-50/60
          p-6
        "
      >
        <div className="flex items-center gap-4">
          <div
            className="
              flex
              h-16
              w-16
              shrink-0
              items-center
              justify-center
              rounded-2xl
              bg-green-700
              text-2xl
              font-bold
              text-white
            "
          >
            {currentUser.name.charAt(0).toUpperCase()}
          </div>

          <div className="min-w-0">
            <h3 className="font-bold text-green-950">
              {currentUser.name}
            </h3>

            <p className="truncate text-sm text-slate-500">
              {currentUser.email}
            </p>

            <span
              className={`
                mt-2
                inline-flex
                rounded-full
                px-3
                py-1
                text-xs
                font-semibold
                ${roleColor}
              `}
            >
              {roleLabel}
            </span>
          </div>
        </div>

        {/* INFORMACIÓN PRODUCTOR */}

        {currentUser.role === 'productor' && (
          <div className="mt-6 border-t border-green-100 pt-5">
            <div className="grid gap-4 sm:grid-cols-2">
              {currentUser.farmName && (
                <InfoItem
                  icon={<Store size={16} />}
                  label="Finca"
                  value={currentUser.farmName}
                />
              )}

              <InfoItem
                icon={<MapPin size={16} />}
                label="Municipio"
                value={currentUser.city}
              />

              {currentUser.association && (
                <InfoItem
                  icon={<Users size={16} />}
                  label="Asociación"
                  value={currentUser.association}
                />
              )}

              {currentUser.products &&
                currentUser.products.length > 0 && (
                  <InfoItem
                    icon={<Leaf size={16} />}
                    label="Productos"
                    value={currentUser.products.join(
                      ', '
                    )}
                  />
                )}
            </div>

            {currentUser.status === 'pendiente' && (
              <div
                className="
                  mt-5
                  rounded-2xl
                  border
                  border-amber-200
                  bg-amber-50
                  p-4
                  text-sm
                  text-amber-800
                "
              >
                <div className="flex gap-3">
                  <AlertCircle
                    size={19}
                    className="mt-0.5 shrink-0"
                  />

                  <div>
                    <p className="font-bold">
                      Cuenta pendiente de validación
                    </p>

                    <p className="mt-1 text-xs leading-5">
                      El administrador podrá revisar tus
                      datos antes de habilitar la publicación
                      de productos.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CLIENTE */}

        {currentUser.role === 'cliente' && (
          <div className="mt-6 border-t border-green-100 pt-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoItem
                icon={<MapPin size={16} />}
                label="Municipio"
                value={currentUser.city}
              />

              <InfoItem
                icon={<Building2 size={16} />}
                label="Tipo de negocio"
                value={currentUser.businessType}
              />
            </div>
          </div>
        )}
      </div>

      <button
        onClick={onLogout}
        className="
          mt-8
          flex
          w-full
          items-center
          justify-center
          gap-2
          rounded-2xl
          border
          border-slate-200
          bg-white
          py-4
          font-bold
          text-slate-700
          transition
          hover:border-red-200
          hover:bg-red-50
          hover:text-red-600
        "
      >
        Cerrar sesión
      </button>
    </div>
  );
};

/* =========================================================
   INFO ITEM
========================================================= */

const InfoItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
}> = ({ icon, label, value }) => (
  <div className="flex gap-3">
    <div
      className="
        flex
        h-9
        w-9
        shrink-0
        items-center
        justify-center
        rounded-xl
        bg-white
        text-green-700
      "
    >
      {icon}
    </div>

    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-semibold text-slate-700">
        {value}
      </p>
    </div>
  </div>
);

/* =========================================================
   INPUT
========================================================= */

const InputField: React.FC<{
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  icon?: React.ReactNode;
  type?: string;
  required?: boolean;
}> = ({
  label,
  placeholder,
  value,
  onChange,
  icon,
  type = 'text',
}) => (
  <div>
    <label className="mb-2 block text-sm font-bold text-slate-700">
      {label}
    </label>

    <div className="relative">
      {icon && (
        <div
          className="
            absolute
            left-4
            top-1/2
            -translate-y-1/2
            text-slate-400
          "
        >
          {icon}
        </div>
      )}

      <input
        type={type}
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
        placeholder={placeholder}
        className={`
          h-14
          w-full
          rounded-2xl
          border
          border-slate-200
          bg-slate-50
          ${icon ? 'pl-12' : 'px-4'}
          pr-4
          outline-none
          transition
          focus:border-green-500
          focus:bg-white
          focus:ring-4
          focus:ring-green-100
        `}
      />
    </div>
  </div>
);

/* =========================================================
   TIPO DE REGISTRO
========================================================= */

const RegisterTypeCard: React.FC<{
  active: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}> = ({
  active,
  icon,
  title,
  description,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`
      relative
      rounded-3xl
      border
      p-5
      text-left
      transition-all
      duration-300
      ${
        active
          ? 'border-green-500 bg-green-50 shadow-md'
          : 'border-slate-200 bg-white hover:border-green-300'
      }
    `}
  >
    {active && (
      <div
        className="
          absolute
          right-4
          top-4
          flex
          h-6
          w-6
          items-center
          justify-center
          rounded-full
          bg-green-700
          text-white
        "
      >
        <Check size={14} />
      </div>
    )}

    <div
      className={`
        mb-4
        flex
        h-12
        w-12
        items-center
        justify-center
        rounded-2xl
        ${
          active
            ? 'bg-green-700 text-white'
            : 'bg-slate-100 text-slate-500'
        }
      `}
    >
      {icon}
    </div>

    <h3 className="font-bold text-slate-800">
      {title}
    </h3>

    <p className="mt-1 text-sm leading-6 text-slate-500">
      {description}
    </p>
  </button>
);

/* =========================================================
   TITULO DE SECCIÓN
========================================================= */

const SectionTitle: React.FC<{
  number: string;
  title: string;
}> = ({ number, title }) => (
  <div className="flex items-center gap-3 border-b border-slate-100 pb-3 pt-2">
    <span
      className="
        flex
        h-7
        w-7
        items-center
        justify-center
        rounded-lg
        bg-green-100
        text-[11px]
        font-black
        text-green-700
      "
    >
      {number}
    </span>

    <h3 className="text-sm font-black uppercase tracking-wide text-green-950">
      {title}
    </h3>
  </div>
);

/* =========================================================
   MENSAJE
========================================================= */

const MessageBox: React.FC<{
  type: 'error' | 'success';
  message: string;
}> = ({ type, message }) => (
  <div
    className={`
      mt-4
      flex
      gap-3
      rounded-2xl
      border
      px-4
      py-3
      text-sm
      ${
        type === 'error'
          ? 'border-red-200 bg-red-50 text-red-800'
          : 'border-green-200 bg-green-50 text-green-800'
      }
    `}
  >
    {type === 'error' ? (
      <AlertCircle
        size={18}
        className="mt-0.5 shrink-0"
      />
    ) : (
      <CheckCircle2
        size={18}
        className="mt-0.5 shrink-0"
      />
    )}

    <span>{message}</span>
  </div>
);

/* =========================================================
   FEATURE
========================================================= */

const Feature: React.FC<{
  icon: React.ReactNode;
  text: string;
}> = ({ icon, text }) => (
  <div className="group flex flex-col items-center text-center">
    <div
      className="
        mb-2
        flex
        h-12
        w-12
        items-center
        justify-center
        rounded-full
        border
        border-white/20
        bg-white/15
        text-green-200
        shadow-lg
        backdrop-blur-md
        transition
        group-hover:scale-110
        group-hover:bg-white/25
      "
    >
      {icon}
    </div>

    <span
      className="
        text-xs
        font-semibold
        leading-5
        text-white/90
      "
    >
      {text}
    </span>
  </div>
);

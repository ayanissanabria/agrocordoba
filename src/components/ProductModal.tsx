import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, 
  MapPin, 
  MessageCircle, 
  Calculator, 
  Truck, 
  Calendar, 
  Package, 
  Check, 
} from 'lucide-react';
import { Product, UserProfile, BusinessType, QuotationRequest, FulfillmentMethod, PaymentMethod } from '../types';
import { FREIGHT_RATES, USD_EXCHANGE_RATE } from '../data/mockData';
import { formatCop, calculateVolumeDiscount, formatShortProductName } from '../utils/formatters';
import { getProductPath, getProductStructuredData } from '../utils/productSeo';

interface ProductModalProps {
  product: Product | null;
  isPage?: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  onRequireLogin?: () => void;
  onSubmitQuotation: (quotation: Omit<QuotationRequest, 'id' | 'createdAt' | 'status'>) => Promise<QuotationRequest | void> | QuotationRequest | void;
}

export const ProductModal: React.FC<ProductModalProps> = ({
  product,
  isPage = false,
  onClose,
  currentUser,
  onRequireLogin,
  onSubmitQuotation,
}) => {
  if (!product) return null;

  // Calculator State
  const [quantityKg, setQuantityKg] = useState<number>(product.minOrderKg || 500);
  const [destinationZone, setDestinationZone] = useState<
    'Local Córdoba' | 'Medellín / Antioquia' | 'Bogotá D.C.' | 'Costa Caribe' | 'Internacional'
  >('Local Córdoba');
  const [notes, setNotes] = useState<string>('');
  const [fulfillmentMethod, setFulfillmentMethod] = useState<FulfillmentMethod>('domicilio');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryLatitude, setDeliveryLatitude] = useState<number | null>(null);
  const [deliveryLongitude, setDeliveryLongitude] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('transferencia');
  const [locationMessage, setLocationMessage] = useState('');

  // Buyer Info State (defaulting to current user if available)
  const [clientName, setClientName] = useState<string>(currentUser?.name || '');
  const [clientEmail, setClientEmail] = useState<string>(currentUser?.email || '');
  const [clientPhone, setClientPhone] = useState<string>(currentUser?.phone || '');
  const [clientBusinessType, setClientBusinessType] = useState<BusinessType>(
    currentUser?.businessType || 'Restaurante'
  );
  const [clientCity, setClientCity] = useState<string>(currentUser?.city || 'Montería');

  const [quotationSaved, setQuotationSaved] = useState<boolean>(false);
  const [quotationError, setQuotationError] = useState('');

  useEffect(() => {
    if (!isPage) return;

    const previousTitle = document.title;
    const descriptionMeta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const canonicalLink = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const openGraphTitleMeta = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
    const openGraphDescriptionMeta = document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
    const openGraphUrlMeta = document.querySelector<HTMLMetaElement>('meta[property="og:url"]');
    const openGraphImageMeta = document.querySelector<HTMLMetaElement>('meta[property="og:image"]');
    const previousDescription = descriptionMeta?.content;
    const previousCanonical = canonicalLink?.href;
    const previousOpenGraphTitle = openGraphTitleMeta?.content;
    const previousOpenGraphDescription = openGraphDescriptionMeta?.content;
    const previousOpenGraphUrl = openGraphUrlMeta?.content;
    const previousOpenGraphImage = openGraphImageMeta?.content;

    document.title = `${formatShortProductName(product.name)} en ${product.municipalityName} | AgroCórdoba`;
    if (descriptionMeta) descriptionMeta.content = product.description;
    if (canonicalLink) canonicalLink.href = `${window.location.origin}${getProductPath(product)}`;
    if (openGraphTitleMeta) openGraphTitleMeta.content = document.title;
    if (openGraphDescriptionMeta) openGraphDescriptionMeta.content = product.description;
    if (openGraphUrlMeta) openGraphUrlMeta.content = `${window.location.origin}${getProductPath(product)}`;
    if (openGraphImageMeta) {
      openGraphImageMeta.content = product.image.startsWith('http')
        ? product.image
        : `${window.location.origin}${product.image.startsWith('/') ? '' : '/'}${product.image}`;
    }

    return () => {
      document.title = previousTitle;
      if (descriptionMeta && previousDescription !== undefined) {
        descriptionMeta.content = previousDescription;
      }
      if (canonicalLink && previousCanonical !== undefined) {
        canonicalLink.href = previousCanonical;
      }
      if (openGraphTitleMeta && previousOpenGraphTitle !== undefined) {
        openGraphTitleMeta.content = previousOpenGraphTitle;
      }
      if (openGraphDescriptionMeta && previousOpenGraphDescription !== undefined) {
        openGraphDescriptionMeta.content = previousOpenGraphDescription;
      }
      if (openGraphUrlMeta && previousOpenGraphUrl !== undefined) {
        openGraphUrlMeta.content = previousOpenGraphUrl;
      }
      if (openGraphImageMeta && previousOpenGraphImage !== undefined) {
        openGraphImageMeta.content = previousOpenGraphImage;
      }
    };
  }, [isPage, product]);

  useEffect(() => {
    if (!currentUser) return;
    setClientName((name) => name || currentUser.name);
    setClientEmail((email) => email || currentUser.email);
    setClientPhone((phone) => phone || currentUser.phone);
    setClientBusinessType(currentUser.businessType || 'Restaurante');
    setClientCity(currentUser.city || 'Montería');
  }, [currentUser]);

  // Calculations
  const calculations = useMemo(() => {
    const rawTotalCop = quantityKg * product.priceCopKg;
    const discountPercent = calculateVolumeDiscount(quantityKg);
    const discountCop = (rawTotalCop * discountPercent) / 100;
    const subtotalAfterDiscountCop = rawTotalCop - discountCop;
    const freightCop = fulfillmentMethod === 'recoger'
      ? 0
      : FREIGHT_RATES[destinationZone] || 150000;
    const totalCop = subtotalAfterDiscountCop + freightCop;
    const totalUsd = totalCop / USD_EXCHANGE_RATE;

    return {
      rawTotalCop,
      discountPercent,
      discountCop,
      subtotalAfterDiscountCop,
      freightCop,
      totalCop,
      totalUsd,
    };
  }, [quantityKg, product.priceCopKg, destinationZone, fulfillmentMethod]);

  const handlePresetQuantity = (amount: number) => {
    setQuantityKg((prev) => Math.max(product.minOrderKg, prev + amount));
  };

  const handleSaveQuotation = async () => {
    setQuotationError('');
    if (fulfillmentMethod === 'domicilio' && !deliveryAddress.trim()) {
      setQuotationError('Escribe la dirección de entrega para solicitar domicilio.');
      return;
    }
    try {
      await onSubmitQuotation({
      productId: product.id,
      productName: formatShortProductName(product.name),
      productVariety: product.variety,
      producerName: product.producerName,
      producerAssociation: product.producerAssociation,
      producerWhatsapp: product.producerWhatsapp,
      clientName: clientName || 'Comprador Anónimo',
      clientEmail: clientEmail || 'sin-correo@agrecordoba.co',
      clientPhone: clientPhone || '+57 300 000 0000',
      clientBusinessType,
      clientCity,
      quantityKg,
      destinationZone,
      fulfillmentMethod,
      deliveryAddress: fulfillmentMethod === 'domicilio' ? deliveryAddress.trim() : '',
      deliveryLatitude: fulfillmentMethod === 'domicilio' ? deliveryLatitude : null,
      deliveryLongitude: fulfillmentMethod === 'domicilio' ? deliveryLongitude : null,
      paymentMethod,
      freightCop: calculations.freightCop,
      subtotalCop: calculations.subtotalAfterDiscountCop,
      totalCop: calculations.totalCop,
      totalUsd: calculations.totalUsd,
      discountPercent: calculations.discountPercent,
        notes,
      });
      setQuotationSaved(true);
      setTimeout(() => setQuotationSaved(false), 3500);
    } catch (error) {
      setQuotationError((error as Error).message || 'No se pudo enviar la cotización.');
    }
  };

  const captureDeliveryLocation = () => {
    setLocationMessage('');
    if (!navigator.geolocation) {
      setLocationMessage('Este navegador no permite consultar la ubicación. Puedes escribir la dirección manualmente.');
      return;
    }
    setLocationMessage('Solicitando permiso para obtener tu ubicación una sola vez…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setDeliveryLatitude(coords.latitude);
        setDeliveryLongitude(coords.longitude);
        setLocationMessage('Ubicación capturada. Solo se compartirá con el productor si acepta el pedido.');
      },
      (error) => {
        const message = error.code === error.PERMISSION_DENIED
          ? 'No diste permiso de ubicación. Puedes escribir la dirección y continuar.'
          : error.code === error.POSITION_UNAVAILABLE
            ? 'No fue posible obtener la ubicación. Escribe la dirección y continúa.'
            : 'La solicitud de ubicación tardó demasiado. Escribe la dirección y continúa.';
        setLocationMessage(message);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const ProductHeading = isPage ? 'h1' : 'h3';
  const hasServerStructuredData = isPage &&
    document.getElementById('product-structured-data') !== null;

  return (
    <>
    {isPage && !hasServerStructuredData && (
      <script type="application/ld+json">
        {JSON.stringify(getProductStructuredData(product)).replace(/</g, '\\u003c')}
      </script>
    )}
    <div className={isPage
      ? 'min-h-screen bg-[#f1efdf] px-3 py-6 sm:px-6 sm:py-10'
      : 'fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/65 backdrop-blur-xs overflow-y-auto'}>
      <div 
        className={isPage
          ? 'relative mx-auto w-full max-w-6xl bg-white rounded-3xl shadow-xl border border-[#c0c9c1] overflow-hidden'
          : 'relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-[#c0c9c1] overflow-hidden my-6 max-h-[92vh] flex flex-col'}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div className="bg-[#003622] text-white px-6 py-4 flex items-center justify-between border-b border-[#134e35]">
          <div className="flex items-center gap-2">
            <span className="bg-[#b4f0cd] text-[#003622] text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full">
              Ficha del producto
            </span>
            <span className="text-white/60 text-xs hidden sm:inline">•</span>
            <span className="text-xs text-[#b4f0cd] font-medium hidden sm:inline">
              Origen: {product.municipalityName} (Córdoba)
            </span>
          </div>

          <button
            id="btn-close-modal"
            onClick={onClose}
            className={isPage
              ? 'rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20'
              : 'p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition'}
            aria-label={isPage ? 'Volver a las cosechas' : 'Cerrar ventana'}
          >
            {isPage ? 'Volver a las cosechas' : <X className="w-5 h-5" />}
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className={isPage ? 'p-5 sm:p-8 space-y-8' : 'overflow-y-auto flex-1 p-6 space-y-8'}>
          {/* Section 1: Product Overview & Producer Profile */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
            {/* Image & Origin Geo */}
            <div className="md:col-span-5 space-y-3">
              <div className="relative rounded-2xl overflow-hidden aspect-[4/3] border border-[#c0c9c1]/60 shadow-sm">
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                  onError={(event) => {
                    const fallback = product.name.toLowerCase().includes('yuca')
                      ? '/images/yuca-real.jpg'
                      : '/images/field-aerial-1.webp';
                    if (event.currentTarget.getAttribute('src') !== fallback) {
                      event.currentTarget.src = fallback;
                    }
                  }}
                />
                <div className="absolute bottom-2 left-2 right-2 bg-black/75 backdrop-blur-xs text-white text-[11px] px-2.5 py-1 rounded-lg flex items-center justify-between">
                  <span className="flex items-center gap-1 font-mono text-[#b4f0cd]">
                    <MapPin className="w-3 h-3" /> Lat: {product.lat.toFixed(4)}, Lng: {product.lng.toFixed(4)}
                  </span>
                  <span className="text-white/70">Córdoba</span>
                </div>
              </div>

              {/* Producer Card */}
              <div className="bg-[#f7fdf8] border border-[#b4f0cd] rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <img
                    src={product.producerPhoto}
                    alt={product.producerName}
                    className="w-12 h-12 rounded-full object-cover border-2 border-[#134e35]"
                    referrerPolicy="no-referrer"
                    onError={(event) => {
                      const fallback = '/images/campesinos-colombia.jpg';
                      if (event.currentTarget.getAttribute('src') !== fallback) {
                        event.currentTarget.src = fallback;
                      }
                    }}
                  />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-bold text-sm text-[#151d19]">
                        {product.producerName}
                      </h4>
                      <span title="Perfil del productor">
                        <MapPin className="w-4 h-4 text-emerald-700" />
                      </span>
                    </div>
                    <p className="text-xs text-[#003622] font-semibold">
                      {product.producerAssociation}
                    </p>
                    <p className="text-[11px] text-[#707972]">
                      {product.producerExperienceYears} años de tradición agrícola
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-start gap-2 border-t border-[#c0c9c1]/40 pt-3 text-xs text-[#285b3c]">
                  <MessageCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <p>La conversación y la negociación se realizan aquí, dentro de AgroCórdoba.</p>
                </div>
              </div>
            </div>

            {/* Product Details & Specs */}
            <div className="md:col-span-7 space-y-4">
              <div>
                <span className="text-xs font-bold text-[#9b4500] uppercase tracking-wider">
                  Variedad: {product.variety}
                </span>
                <ProductHeading className="font-display font-bold text-2xl text-[#151d19] mt-0.5">
                  {formatShortProductName(product.name)}
                </ProductHeading>
                <p className="mt-2 text-sm text-[#404943] leading-relaxed">
                  {product.description}
                </p>
              </div>

              {/* Price Callout */}
              <div className="bg-[#eef8f1] border border-[#b4f0cd] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] uppercase tracking-wider text-[#707972] font-semibold block">
                    Precio Base en Finca
                  </span>
                  <div className="flex items-baseline gap-2 mt-0.5">
                    <span className="text-2xl font-display font-bold text-[#003622]">
                      {formatCop(product.priceCopKg)}
                    </span>
                    <span className="text-xs text-[#707972]">COP / kg</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[11px] uppercase tracking-wider text-[#707972] font-semibold block">
                    Disponibilidad Inmediata
                  </span>
                  <span className="text-base font-bold text-[#003622]">
                    {product.stockAvailableKg.toLocaleString('es-CO')} kg
                  </span>
                  <span className="text-[11px] text-[#707972] block">
                    Mínimo: {product.minOrderKg} kg
                  </span>
                </div>
              </div>

              {/* Technical Specifications Grid */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-white p-3 rounded-xl border border-[#c0c9c1]/60">
                  <span className="text-[#707972] flex items-center gap-1 font-medium">
                    <Calendar className="w-3.5 h-3.5 text-[#003622]" /> Época de Cosecha
                  </span>
                  <p className="mt-1 font-semibold text-[#151d19]">
                    {product.harvestSeason}
                  </p>
                </div>

                <div className="bg-white p-3 rounded-xl border border-[#c0c9c1]/60">
                  <span className="text-[#707972] flex items-center gap-1 font-medium">
                    <Package className="w-3.5 h-3.5 text-[#003622]" /> Empaque Comercial
                  </span>
                  <p className="mt-1 font-semibold text-[#151d19]">
                    {product.packaging}
                  </p>
                </div>
              </div>

            </div>
          </div>

          {/* Section 2: Volume Quotation Calculator */}
          <div className="bg-[#f7fdf8] border-2 border-[#134e35]/30 rounded-3xl p-5 sm:p-6 shadow-sm">
            <div className="flex items-center justify-between pb-3 border-b border-[#c0c9c1]/40 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#003622] text-[#b4f0cd] flex items-center justify-center">
                  <Calculator className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-display font-bold text-base text-[#151d19]">
                    Calculadora de Cotización por Volumen y Flete
                  </h4>
                  <p className="text-xs text-[#707972]">
                    Estimación de costos y descuentos por volumen
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-emerald-700 bg-[#b4f0cd] px-2.5 py-1 rounded-full">
                Valores de referencia
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Inputs */}
              <div className="md:col-span-7 space-y-4">
                {/* Quantity input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-[#151d19] uppercase tracking-wider">
                      Cantidad Requerida (Kilogramos):
                    </label>
                    <span className="text-xs text-[#707972]">
                      Pedido mín: {product.minOrderKg} kg
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="input-calc-quantity"
                      type="number"
                      min={product.minOrderKg}
                      max={product.stockAvailableKg}
                      step={50}
                      value={quantityKg}
                      onChange={(e) => setQuantityKg(Math.max(1, Number(e.target.value)))}
                      className="w-full text-base font-bold text-[#003622] bg-white border border-[#c0c9c1] rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#003622]"
                    />
                    <span className="text-sm font-bold text-[#404943]">KG</span>
                  </div>

                  {/* Preset quick buttons */}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="text-[11px] text-[#707972] self-center mr-1">Sumar:</span>
                    <button
                      onClick={() => handlePresetQuantity(100)}
                      className="text-xs px-2.5 py-1 rounded-lg bg-white border border-[#c0c9c1] hover:bg-[#eef8f1] font-semibold text-[#151d19]"
                    >
                      +100 kg
                    </button>
                    <button
                      onClick={() => handlePresetQuantity(500)}
                      className="text-xs px-2.5 py-1 rounded-lg bg-white border border-[#c0c9c1] hover:bg-[#eef8f1] font-semibold text-[#151d19]"
                    >
                      +500 kg
                    </button>
                    <button
                      onClick={() => handlePresetQuantity(1000)}
                      className="text-xs px-2.5 py-1 rounded-lg bg-white border border-[#c0c9c1] hover:bg-[#eef8f1] font-semibold text-[#151d19]"
                    >
                      +1.000 kg (1 Ton)
                    </button>
                    <button
                      onClick={() => handlePresetQuantity(5000)}
                      className="text-xs px-2.5 py-1 rounded-lg bg-white border border-[#c0c9c1] hover:bg-[#eef8f1] font-semibold text-[#151d19]"
                    >
                      +5.000 kg (5 Ton)
                    </button>
                  </div>
                </div>

                {/* Destination Zone */}
                <div>
                  <label className="text-xs font-bold text-[#151d19] uppercase tracking-wider block mb-1.5">
                    Zona de Destino Logístico (Flete Referencial):
                  </label>
                  <select
                    id="select-calc-destination"
                    value={destinationZone}
                    onChange={(e) => setDestinationZone(e.target.value as any)}
                    className="w-full text-xs font-semibold bg-white border border-[#c0c9c1] rounded-xl px-3.5 py-2.5 text-[#151d19] focus:outline-none focus:ring-2 focus:ring-[#003622]"
                  >
                    <option value="Local Córdoba">Local Córdoba (Montería, Cereté, etc.) — Flete bajo</option>
                    <option value="Costa Caribe">Costa Caribe (Cartagena, Barranquilla, Santa Marta)</option>
                    <option value="Medellín / Antioquia">Medellín / Valle de Aburrá (Troncal Occidental)</option>
                    <option value="Bogotá D.C.">Bogotá D.C. / Cundinamarca</option>
                    <option value="Internacional">Puerto Marítimo / Exportación (Cartagena / Coveñas)</option>
                  </select>
                </div>

                <fieldset className="space-y-3 rounded-xl border border-[#dce5dc] bg-white p-3">
                  <legend className="px-1 text-xs font-bold uppercase tracking-wide text-[#183b2b]">Entrega y pago</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[#dce5dc] p-3 text-xs">
                      <input
                        type="radio"
                        name="fulfillment-method"
                        value="domicilio"
                        checked={fulfillmentMethod === 'domicilio'}
                        onChange={() => setFulfillmentMethod('domicilio')}
                        className="mt-0.5 accent-[#134e35]"
                      />
                      <span><b className="block text-[#183b2b]">Domicilio</b>Indica la dirección de entrega.</span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[#dce5dc] p-3 text-xs">
                      <input
                        type="radio"
                        name="fulfillment-method"
                        value="recoger"
                        checked={fulfillmentMethod === 'recoger'}
                        onChange={() => {
                          setFulfillmentMethod('recoger');
                          setLocationMessage('');
                        }}
                        className="mt-0.5 accent-[#134e35]"
                      />
                      <span><b className="block text-[#183b2b]">Recoger</b>En la dirección que confirme el productor.</span>
                    </label>
                  </div>
                  {fulfillmentMethod === 'domicilio' && (
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-[#3d4a42]">
                        Dirección donde se entrega el pedido
                        <textarea
                          required
                          maxLength={500}
                          value={deliveryAddress}
                          onChange={(event) => setDeliveryAddress(event.target.value)}
                          placeholder="Barrio, calle/carrera, número, municipio y referencia"
                          rows={2}
                          className="mt-1 w-full resize-y rounded-lg border border-[#c9d6cd] bg-white px-3 py-2 text-sm text-[#18241d]"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={captureDeliveryLocation}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#c9d6cd] px-3 py-2 text-xs font-semibold text-[#285b3c] hover:bg-[#f3f8f3]"
                      >
                        <MapPin size={14} /> Capturar ubicación actual una vez
                      </button>
                      {deliveryLatitude !== null && deliveryLongitude !== null && (
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${deliveryLatitude}&mlon=${deliveryLongitude}#map=17/${deliveryLatitude}/${deliveryLongitude}`}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-xs font-medium text-[#285b3c] underline"
                        >
                          Ver pin de entrega en el mapa
                        </a>
                      )}
                      {locationMessage && <p role="status" className="text-xs text-[#59645e]">{locationMessage}</p>}
                      <p className="text-[11px] leading-5 text-[#59645e]">
                        La ubicación del dispositivo es opcional, se solicita solo al pulsar el botón y se comparte únicamente con el productor si acepta el pedido. No hacemos seguimiento en vivo.
                      </p>
                    </div>
                  )}
                  <label className="block text-xs font-semibold text-[#3d4a42]">
                    Forma de pago preferida
                    <select
                      value={paymentMethod}
                      onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)}
                      className="mt-1 w-full rounded-lg border border-[#c9d6cd] bg-white px-3 py-2 text-sm text-[#18241d]"
                    >
                      <option value="transferencia">Transferencia (se acuerda directamente)</option>
                      <option value="efectivo">Efectivo (se acuerda directamente)</option>
                    </select>
                  </label>
                  <p className="text-[11px] text-[#59645e]">AgroCórdoba solo registra la preferencia; no recibe ni procesa pagos.</p>
                </fieldset>

                {/* Buyer Quick Contact Data (if needs editing) */}
                <div className="pt-2 border-t border-[#c0c9c1]/40 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[11px] font-bold text-[#707972] block mb-1">
                      Su Nombre o Razón Social:
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Restaurante Gourmet"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      className="w-full bg-white border border-[#c0c9c1] rounded-lg px-2.5 py-1.5 text-xs text-[#151d19]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-[#707972] block mb-1">
                      Tipo de Negocio:
                    </label>
                    <select
                      value={clientBusinessType}
                      onChange={(e) => setClientBusinessType(e.target.value as any)}
                      className="w-full bg-white border border-[#c0c9c1] rounded-lg px-2.5 py-1.5 text-xs text-[#151d19]"
                    >
                      <option value="Hogar">Hogar / Compra Colectiva</option>
                      <option value="Restaurante">Restaurante / Hotel</option>
                      <option value="Distribuidor">Distribuidor / Mayorista</option>
                      <option value="Importador">Importador / Exportador</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Calculation Summary Box */}
              <div className="md:col-span-5 bg-white p-4 rounded-2xl border border-[#b4f0cd] flex flex-col justify-between shadow-xs">
                <div>
                  <span className="text-xs font-bold text-[#003622] uppercase tracking-wider block mb-3">
                    Resumen de Liquidación Estimada
                  </span>

                  <p className="mb-3 text-xs leading-5 text-[#707972]">
                    El flete es estimado. Al solicitar, se crea una conversación privada con el productor para acordar precio y entrega.
                  </p>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between text-[#707972]">
                      <span>Subtotal Cosecha ({quantityKg.toLocaleString('es-CO')} kg):</span>
                      <span className="font-semibold text-[#151d19]">
                        {formatCop(calculations.rawTotalCop)}
                      </span>
                    </div>

                    {calculations.discountPercent > 0 && (
                      <div className="flex justify-between text-emerald-700 font-semibold bg-[#b4f0cd]/30 px-2 py-1 rounded">
                        <span>Descuento Volumen ({calculations.discountPercent}%):</span>
                        <span>-{formatCop(calculations.discountCop)}</span>
                      </div>
                    )}

                    <div className="flex justify-between text-[#707972]">
                      <span className="flex items-center gap-1">
                        <Truck className="w-3.5 h-3.5 text-[#9b4500]" />
                        Flete ({destinationZone}):
                      </span>
                      <span className="font-semibold text-[#151d19]">
                        {formatCop(calculations.freightCop)}
                      </span>
                    </div>

                    <div className="pt-2 border-t border-[#c0c9c1]/60 flex justify-between items-baseline">
                      <div>
                        <span className="text-xs font-bold text-[#151d19] block">
                          Total Estimado (COP):
                        </span>
                        <span className="text-[11px] text-[#707972]">
                          En finca + flete a convenir
                        </span>
                      </div>
                      <span className="font-display font-bold text-xl text-[#003622]">
                        {formatCop(calculations.totalCop)}
                      </span>
                    </div>

                  </div>
                </div>

                {/* La cotización se convierte en el hilo de negociación interno. */}
                <div className="mt-4 pt-3 border-t border-[#c0c9c1]/40 space-y-2">
                  {currentUser?.role === 'cliente' && currentUser.authProvider && product.producerId ? (
                    <button
                      id="btn-request-quotation"
                      onClick={handleSaveQuotation}
                      disabled={quotationSaved}
                      className="w-full bg-[#134e35] hover:bg-[#003622] text-white py-3 px-4 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 shadow-sm disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {quotationSaved ? <Check className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
                      {quotationSaved ? 'Solicitud enviada · abriendo chat' : 'Solicitar cotización y abrir chat'}
                    </button>
                  ) : currentUser?.role === 'cliente' && currentUser.authProvider ? (
                    <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                      Esta es una ficha de demostración y no tiene una publicación de productor conectada para iniciar un chat.
                    </p>
                  ) : currentUser ? (
                    <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
                      Inicia sesión con una cuenta de comprador para solicitar una cotización y conversar con el productor.
                    </p>
                  ) : (
                    <button
                      id="btn-login-to-quote"
                      onClick={onRequireLogin}
                      className="w-full bg-[#003622] hover:bg-[#134e35] text-white py-3 px-4 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 shadow-sm"
                    >
                      Inicia sesión como comprador para conversar con el productor
                    </button>
                  )}
                  {quotationError && <p role="alert" className="mt-2 text-sm font-medium text-red-700">{quotationError}</p>}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer Note */}
        <div className="bg-[#f7fdf8] px-6 py-3 border-t border-[#c0c9c1]/40 text-[11px] text-[#707972] flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Continúa la negociación y conserva los acuerdos en el chat de AgroCórdoba.</span>
          <button
            onClick={onClose}
            className="text-xs text-[#003622] font-bold hover:underline"
          >
            {isPage ? 'Volver a las cosechas' : 'Volver al Catálogo'}
          </button>
        </div>
      </div>
    </div>
    </>
  );
};

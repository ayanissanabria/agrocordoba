import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  MapPin,
  Tag,
  ArrowUpDown,
  Sparkles,
  X,
  Package,
  Eye,
  ArrowRight,
  Heart,
} from 'lucide-react';

import { Product, ProductCategory } from '../types';
import { MUNICIPALITIES } from '../data/mockData';
import { MUNICIPAL_CROP_IMAGES, MUNICIPAL_CROPS, MUNICIPAL_CROPS_SOURCE, TIERRALTA_CROPS_SOURCE } from '../data/municipalCrops';
import { formatCop, formatShortProductName } from '../utils/formatters';
import { getProductListStructuredData, getProductPath } from '../utils/productSeo';

interface ProductCatalogProps {
  products: Product[];
  selectedMunicipality: string;
  onSelectMunicipality: (mId: string) => void;
  onOpenProductModal: (product: Product) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  favoriteIds?: string[];
  onToggleFavorite?: (productId: string) => void;
}

const CATEGORIES: ('Todas' | ProductCategory)[] = [
  'Todas',
  'Cereales',
  'Tubérculos y Raíces',
  'Frutas Tropicales',
  'Cacao y Café',
  'Agroindustria y Derivados',
  'Otros cultivos',
];

interface SipsaPriceReference {
  meanPriceCop: number;
  market: string;
  date: string;
}

interface ProductSipsaReferences {
  references: SipsaPriceReference[];
  reportDate: string;
  reportUrl: string;
  fallbackToStoredData: boolean;
}

export const ProductCatalog: React.FC<ProductCatalogProps> = ({
  products,
  selectedMunicipality,
  onSelectMunicipality,
  onOpenProductModal,
  searchQuery,
  onSearchChange,
  favoriteIds = [],
  onToggleFavorite,
}) => {
  const [selectedCategory, setSelectedCategory] =
    useState<'Todas' | ProductCategory>('Todas');

  const [sortBy, setSortBy] = useState<
    'default' | 'price-asc' | 'price-desc' | 'stock-desc'
  >('default');
  const [priceReferences, setPriceReferences] = useState<
    Record<string, ProductSipsaReferences>
  >({});
  const [priceReferencesLoading, setPriceReferencesLoading] = useState(false);
  const [priceReferencesError, setPriceReferencesError] = useState(false);

  const filteredProducts = useMemo(() => {
    return products
      .filter((p) => {
        const q = searchQuery.toLowerCase().trim();

        const matchesSearch =
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.variety.toLowerCase().includes(q) ||
          p.producerName.toLowerCase().includes(q) ||
          p.producerAssociation.toLowerCase().includes(q) ||
          p.municipalityName.toLowerCase().includes(q);

        const matchesMuni =
          selectedMunicipality === 'all' ||
          p.municipalityId === selectedMunicipality;

        const matchesCategory =
          selectedCategory === 'Todas' ||
          p.category === selectedCategory;

        return (
          matchesSearch &&
          matchesMuni &&
          matchesCategory
        );
      })
      .sort((a, b) => {
        if (sortBy === 'price-asc') {
          return a.priceCopKg - b.priceCopKg;
        }

        if (sortBy === 'price-desc') {
          return b.priceCopKg - a.priceCopKg;
        }

        if (sortBy === 'stock-desc') {
          return (
            b.stockAvailableKg -
            a.stockAvailableKg
          );
        }

        return (
          (b.featured ? 1 : 0) -
          (a.featured ? 1 : 0)
        );
      });
  }, [
    products,
    searchQuery,
    selectedMunicipality,
    selectedCategory,
    sortBy,
  ]);

  const productNames = useMemo(
    () => Array.from(new Set(products.map((product) => product.name))),
    [products],
  );

  useEffect(() => {
    if (productNames.length === 0) {
      setPriceReferences({});
      setPriceReferencesLoading(false);
      return;
    }

    const controller = new AbortController();
    const loadPriceReferences = async () => {
      setPriceReferencesLoading(true);
      setPriceReferencesError(false);
      try {
        const batches: string[][] = [];
        for (let index = 0; index < productNames.length; index += 50) {
          batches.push(productNames.slice(index, index + 50));
        }

        const responses = await Promise.all(
          batches.map(async (batch) => {
            const params = new URLSearchParams();
            batch.forEach((productName) => params.append('product', productName));
            const response = await fetch(`/api/price-references/batch?${params}`, {
              signal: controller.signal,
            });
            if (!response.ok) {
              throw new Error('No fue posible consultar las referencias SIPSA.');
            }
            return (await response.json()) as {
              referencesByProduct: Record<string, ProductSipsaReferences>;
            };
          }),
        );
        setPriceReferences(
          Object.assign({}, ...responses.map((response) => response.referencesByProduct)),
        );
      } catch {
        if (!controller.signal.aborted) {
          setPriceReferences({});
          setPriceReferencesError(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setPriceReferencesLoading(false);
        }
      }
    };

    void loadPriceReferences();
    return () => controller.abort();
  }, [productNames]);

  const activeMuniName =
    selectedMunicipality === 'all'
      ? 'Todos los Municipios'
      : MUNICIPALITIES.find(
          (m) => m.id === selectedMunicipality
        )?.name || selectedMunicipality;
  const municipalCrops = selectedMunicipality === 'all'
    ? []
    : (MUNICIPAL_CROPS[selectedMunicipality] || []).filter((crop) =>
        selectedCategory === 'Todas' || crop.category === selectedCategory
      );
  const cropSource = selectedMunicipality === 'tierralta'
    ? TIERRALTA_CROPS_SOURCE
    : MUNICIPAL_CROPS_SOURCE;

  return (
    <>
    {filteredProducts.length > 0 && (
      <script type="application/ld+json">
        {JSON.stringify(getProductListStructuredData(filteredProducts)).replace(/</g, '\\u003c')}
      </script>
    )}
    <section
      id="catalogo"
      className="bg-[#f7f6ef] py-16"
    >
      <div className="container mx-auto px-4">

        {/* =====================================================
            HEADER
        ===================================================== */}

        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">

          <div className="max-w-3xl">

            <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#003622] uppercase tracking-wider bg-[#e8d9b7] px-3 py-1.5 rounded-full mb-3">

              <Tag className="w-3.5 h-3.5" />

              Oferta agrícola de Córdoba

            </div>

            <h2 className="font-editorial text-3xl sm:text-4xl font-bold text-[#151d19] tracking-tight">

              Productos agrícolas de Córdoba

            </h2>

            <p className="mt-2 text-sm sm:text-base text-[#56605a] leading-relaxed">

              Conoce la oferta publicada por productores de la región y solicita información sin intermediarios.

            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">

              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#003622] bg-white border border-[#e4dfd2]/70 px-2.5 py-1.5 rounded-lg">

                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />

                {filteredProducts.length} productos publicados

              </span>

              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#003622] bg-white border border-[#e4dfd2]/70 px-2.5 py-1.5 rounded-lg">

                <MapPin className="w-3 h-3" />

                8 municipios

              </span>

              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#003622] bg-white border border-[#e4dfd2]/70 px-2.5 py-1.5 rounded-lg">

                ✓ Compra directa

              </span>

            </div>

            <p className="mt-3 max-w-2xl text-xs leading-5 text-[#748078]">
              Catálogo de demostración: confirma precio, disponibilidad y entrega con el productor antes de cerrar una compra.
            </p>

          </div>


          {/* Moneda del catálogo */}

          <div className="flex items-center gap-3 self-start lg:self-auto bg-white px-4 py-3 rounded-2xl border border-[#e4dfd2]/60 shadow-sm">

            <div className="w-9 h-9 rounded-xl bg-[#f1efe6] flex items-center justify-center">

              <Tag className="w-4 h-4 text-[#003622]" />

            </div>

            <div>

              <span className="block text-[10px] uppercase tracking-wider font-semibold text-[#707972]">
                Precios publicados en
              </span>

              <span className="font-bold text-[#003622]">
                pesos colombianos (COP)
              </span>

            </div>

          </div>

        </div>


        {/* =====================================================
            FILTROS
        ===================================================== */}

        <div className="mt-8 bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-[#e4dfd2]/60 space-y-5">

          {/* BUSCADOR */}

          <div className="flex flex-col md:flex-row gap-3">

            <div className="relative flex-1">

              <Search className="w-4 h-4 text-[#707972] absolute left-3.5 top-1/2 -translate-y-1/2" />

              <input
                id="catalog-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) =>
                  onSearchChange(e.target.value)
                }
                placeholder="Buscar producto, campesino o municipio..."
                className="w-full pl-10 pr-10 py-3 text-sm rounded-xl border border-[#e4dfd2] focus:outline-none focus:ring-2 focus:ring-[#003622]/20 focus:border-[#003622] bg-[#fbfaf6] transition"
              />

              {searchQuery && (

                <button
                  onClick={() =>
                    onSearchChange('')
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#707972] hover:text-[#003622]"
                >

                  <X className="w-4 h-4" />

                </button>

              )}

            </div>


            {/* ORDEN */}

            <div className="flex items-center gap-2">

              <ArrowUpDown className="w-4 h-4 text-[#707972]" />

              <select
                id="catalog-sort-select"
                value={sortBy}
                onChange={(e) =>
                  setSortBy(
                    e.target.value as
                      | 'default'
                      | 'price-asc'
                      | 'price-desc'
                      | 'stock-desc'
                  )
                }
                className="text-sm font-semibold bg-[#fbfaf6] border border-[#e4dfd2] rounded-xl px-3 py-3 text-[#151d19] focus:outline-none focus:ring-2 focus:ring-[#003622]/20 focus:border-[#003622]"
              >

                <option value="default">
                  Destacados
                </option>

                <option value="price-asc">
                  Precio menor
                </option>

                <option value="price-desc">
                  Precio mayor
                </option>

                <option value="stock-desc">
                  Mayor disponibilidad
                </option>

              </select>

            </div>

          </div>


          {/* MUNICIPIOS */}

          <div>

            <div className="flex items-center justify-between mb-2.5">

              <label className="text-[11px] font-bold text-[#707972] uppercase tracking-wider flex items-center gap-1.5">

                <MapPin className="w-3.5 h-3.5 text-[#003622]" />

                Municipio de origen

              </label>

              {selectedMunicipality !== 'all' && (

                <button
                  onClick={() =>
                    onSelectMunicipality('all')
                  }
                  className="text-xs text-[#9b4500] hover:underline font-semibold"
                >
                  Limpiar
                </button>

              )}

            </div>


            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">

              <button
                onClick={() =>
                  onSelectMunicipality('all')
                }
                className={`text-xs px-3.5 py-2 rounded-xl whitespace-nowrap border transition-all ${
                  selectedMunicipality === 'all'
                    ? 'bg-[#003622] text-[#e8d9b7] border-[#003622] font-bold shadow-sm'
                    : 'bg-[#fbfaf6] text-[#404943] border-[#e4dfd2] hover:bg-[#f1efe6]'
                }`}
              >
                Todos
              </button>

              {MUNICIPALITIES.map((m) => (

                <button
                  key={m.id}
                  onClick={() =>
                    onSelectMunicipality(m.id)
                  }
                  className={`text-xs px-3.5 py-2 rounded-xl whitespace-nowrap border transition-all ${
                    selectedMunicipality === m.id
                      ? 'bg-[#003622] text-[#e8d9b7] border-[#003622] font-bold shadow-sm'
                      : 'bg-[#fbfaf6] text-[#404943] border-[#e4dfd2] hover:bg-[#f1efe6]'
                  }`}
                >

                  {m.name}

                  {m.isCapital && (
                    <span className="ml-1.5 text-[9px] bg-[#e8d9b7] text-[#003622] px-1 rounded">
                      Capital
                    </span>
                  )}

                </button>

              ))}

            </div>

          </div>


          {/* CATEGORÍAS */}

          <div>

            <label className="text-[11px] font-bold text-[#707972] uppercase tracking-wider block mb-2.5">

              Categoría

            </label>

            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">

              {CATEGORIES.map((cat) => (

                <button
                  key={cat}
                  onClick={() =>
                    setSelectedCategory(cat)
                  }
                  className={`text-xs px-3.5 py-2 rounded-xl whitespace-nowrap border transition-all ${
                    selectedCategory === cat
                      ? 'bg-[#134e35] text-white border-[#134e35] font-bold shadow-sm'
                      : 'bg-[#fbfaf6] text-[#404943] border-[#e4dfd2] hover:bg-[#f1efe6]'
                  }`}
                >

                  {cat}

                </button>

              ))}

            </div>

          </div>

        </div>


        {selectedMunicipality !== 'all' && (
          <section className="mt-7" aria-label={`Cultivos registrados en ${activeMuniName}`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-[#315b43]">
                  Productos cultivados en {activeMuniName}
                </p>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[#56605a]">
                  {selectedMunicipality === 'tierralta'
                    ? 'Referencia territorial basada en cultivos documentados por el municipio. No confirma cosecha disponible ni equivale a una oferta de venta.'
                    : 'Referencia territorial basada en el área cultivada reportada para 2023. No confirma cosecha disponible ni equivale a una oferta de venta.'}
                </p>
              </div>
              <a className="shrink-0 text-xs font-semibold text-[#315b43] underline decoration-[#9bb7a1] underline-offset-2" href={cropSource.url} target="_blank" rel="noreferrer">
                Fuente: {cropSource.label}
              </a>
            </div>
            {municipalCrops.length > 0 ? (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {municipalCrops.map((crop) => (
                  <button
                    key={`${crop.name}-${crop.category}`}
                    type="button"
                    onClick={() => {
                      setSelectedCategory(crop.category);
                      onSearchChange('');
                    }}
                    className="group rounded-2xl border border-[#dce5dc] bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#9bb7a1] hover:shadow-md"
                    aria-label={`Ver ofertas de la categoría ${crop.category}; cultivo registrado: ${crop.name}`}
                  >
                    <span className="relative -mx-4 -mt-4 mb-3 block aspect-[4/3] overflow-hidden bg-[#edf5ee]">
                      <img
                        src={MUNICIPAL_CROP_IMAGES[crop.name] || '/images/field-aerial-1.webp'}
                        alt={`Fotografía de referencia de ${crop.name}`}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.src = '/images/field-aerial-1.webp';
                        }}
                      />
                      <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-1 text-[10px] font-medium text-white">
                        Foto de referencia
                      </span>
                    </span>
                    <span className="block font-semibold text-[#183b2b]">{crop.name}</span>
                    <span className="mt-1 block text-xs text-[#68766d]">{crop.category}</span>
                    {crop.shareOfMunicipalCropArea !== undefined && (
                      <span className="mt-3 block border-t border-[#edf0eb] pt-2 text-[11px] text-[#68766d]">
                        {crop.shareOfMunicipalCropArea}% del área agrícola reportada
                      </span>
                    )}
                    <span className="mt-3 block text-[11px] font-semibold text-[#315b43]">Ver categoría →</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-[#68766d]">
                {selectedCategory === 'Todas'
                  ? 'La fuente consultada no contiene un registro comparable para este municipio.'
                  : `No hay cultivos reportados en esta categoría para ${activeMuniName} en la fuente consultada.`}
              </p>
            )}
          </section>
        )}

        {/* =====================================================
            FILTROS ACTIVOS
        ===================================================== */}

        {(selectedMunicipality !== 'all' ||
          selectedCategory !== 'Todas' ||
          searchQuery) && (

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">

            <span className="text-[#707972] font-medium">
              Filtrando por:
            </span>

            {selectedMunicipality !== 'all' && (

              <span className="bg-[#dff7e8] text-[#003622] font-semibold px-3 py-1.5 rounded-full">

                {activeMuniName}

              </span>

            )}

            {selectedCategory !== 'Todas' && (

              <span className="bg-[#dff7e8] text-[#003622] font-semibold px-3 py-1.5 rounded-full">

                {selectedCategory}

              </span>

            )}

            {searchQuery && (

              <span className="bg-[#ffeadf] text-[#9b4500] font-semibold px-3 py-1.5 rounded-full">

                "{searchQuery}"

              </span>

            )}

            <button
              onClick={() => {
                onSelectMunicipality('all');
                setSelectedCategory('Todas');
                onSearchChange('');
              }}
              className="text-[#9b4500] hover:underline font-semibold"
            >
              Limpiar filtros
            </button>

          </div>

        )}


        {/* =====================================================
            SIN RESULTADOS
        ===================================================== */}

        {filteredProducts.length === 0 ? (

          <div className="mt-12 bg-white rounded-3xl p-12 text-center border border-[#e4dfd2]/60 max-w-lg mx-auto">

            <div className="w-14 h-14 rounded-2xl bg-[#f1efe6] border border-[#e8d9b7] flex items-center justify-center mx-auto text-[#003622] mb-4">

              <Search className="w-6 h-6" />

            </div>

            <h3 className="font-display font-bold text-xl text-[#151d19]">

              No encontramos productos

            </h3>

            <p className="mt-2 text-sm text-[#707972]">

              {selectedMunicipality !== 'all'
                ? 'No hay ofertas publicadas con estos filtros. Los cultivos registrados arriba son contexto regional y no significan que haya producto disponible para comprar.'
                : 'Prueba con otro producto, municipio o categoría.'}

            </p>

            <button
              onClick={() => {
                onSelectMunicipality('all');
                setSelectedCategory('Todas');
                onSearchChange('');
              }}
              className="mt-5 bg-[#003622] text-[#e8d9b7] hover:text-white px-5 py-2.5 rounded-xl text-sm font-semibold"
            >
              Ver todos los productos
            </button>

          </div>

        ) : (

          /* =====================================================
             PRODUCT GRID
          ===================================================== */

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">

            {filteredProducts.map((product) => {
              const officialReference = priceReferences[product.name]?.references[0];
              const priceReferenceUrl = priceReferences[product.name]?.reportUrl;

              return (

                <article
                  key={product.id}
                  id={`product-card-${product.id}`}
                  className="
                    group
                    bg-white
                    rounded-3xl
                    border
                    border-[#d6ded8]
                    hover:border-[#8ab79b]
                    shadow-sm
                    hover:shadow-xl
                    transition-all
                    duration-300
                    flex
                    flex-col
                    overflow-hidden
                    hover:-translate-y-1
                  "
                >

                  {/* =================================================
                      IMAGE
                  ================================================= */}

                  <div className="relative aspect-[4/3] w-full bg-[#f1efe6] overflow-hidden">

                    <img
                      src={product.image}
                      alt={product.name}
                      className="
                        w-full
                        h-full
                        object-cover
                        group-hover:scale-105
                        transition-transform
                        duration-700
                      "
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      onError={(event) => {
                        const fallback = product.name.toLowerCase().includes('yuca')
                          ? '/images/yuca-real.jpg'
                          : '/images/field-aerial-1.webp';
                        if (event.currentTarget.getAttribute('src') !== fallback) {
                          event.currentTarget.src = fallback;
                        }
                      }}
                    />

                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-black/10" />

                    {onToggleFavorite && (
                      <button
                        type="button"
                        onClick={() => onToggleFavorite(product.id)}
                        aria-pressed={favoriteIds.includes(product.id)}
                        aria-label={favoriteIds.includes(product.id)
                          ? `Quitar ${formatShortProductName(product.name)} de favoritos`
                          : `Guardar ${formatShortProductName(product.name)} en favoritos`}
                        title={favoriteIds.includes(product.id) ? 'Quitar de favoritos' : 'Guardar en favoritos'}
                        className={`absolute right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md transition hover:scale-105 ${favoriteIds.includes(product.id) ? 'text-rose-600' : 'text-[#526158] hover:text-rose-600'}`}
                      >
                        <Heart className={`h-5 w-5 ${favoriteIds.includes(product.id) ? 'fill-current' : ''}`} />
                      </button>
                    )}


                    {/* MUNICIPIO */}

                    <div className="absolute top-3 left-3">

                      <span className="
                        bg-[#003622]/90
                        backdrop-blur-sm
                        text-[#dff7e8]
                        text-[11px]
                        font-bold
                        px-2.5
                        py-1.5
                        rounded-xl
                        flex
                        items-center
                        gap-1
                        shadow-sm
                      ">

                        <MapPin className="w-3 h-3" />

                        {product.municipalityName}

                      </span>

                    </div>


                    {/* CATEGORÍA */}

                    <div className="absolute right-3 top-14">

                      <span className="
                        bg-white/95
                        backdrop-blur-sm
                        text-[#151d19]
                        text-[10px]
                        font-bold
                        px-2.5
                        py-1.5
                        rounded-xl
                        shadow-sm
                      ">

                        {product.category}

                      </span>

                    </div>


                    {product.id === 'prod-2' && (
                      <a
                        href="https://commons.wikimedia.org/wiki/File:YAM_TUBER.jpg"
                        target="_blank"
                        rel="noreferrer"
                        className="absolute bottom-3 left-3 rounded-lg bg-black/65 px-2 py-1 text-[9px] font-medium text-white/90 backdrop-blur-sm hover:text-white"
                        aria-label="Crédito de la fotografía de referencia del ñame: Bambi Cia, Nigeria, licencia Creative Commons BY-SA 4.0"
                      >
                        Foto de referencia · Bambi Cia (Nigeria)
                      </a>
                    )}

                    {/* FEATURED LABEL */}
                    {product.featured && (

                        <span className="absolute bottom-3 right-3
                          bg-[#f59e0b]
                          text-[#241500]
                          font-bold
                          px-2.5
                          py-1.5
                          rounded-xl
                          text-[10px]
                          flex
                          items-center
                          gap-1
                          shadow-sm
                        ">

                          <Sparkles className="w-3 h-3" />

                          Destacado

                        </span>
                    )}

                  </div>


                  {/* =================================================
                      BODY
                  ================================================= */}

                  <div className="p-4 sm:p-5 flex-1 flex flex-col">

                    {/* PRODUCT NAME */}

                    <div>

                      <h3 className="
                        font-display
                        font-bold
                        text-xl
                        text-[#151d19]
                        group-hover:text-[#003622]
                        transition-colors
                      ">

                        {formatShortProductName(product.name)}

                      </h3>

                    </div>


                    {/* PRODUCER */}

                    <div className="mt-4 flex items-center gap-3">

                      <img
                        src={product.producerPhoto}
                        alt={product.producerName}
                        className="
                          w-10
                          h-10
                          rounded-full
                          object-cover
                          border-2
                          border-[#dff7e8]
                          shrink-0
                        "
                        referrerPolicy="no-referrer"
                        onError={(event) => {
                          const fallback = '/images/campesinos-colombia.jpg';
                          if (event.currentTarget.getAttribute('src') !== fallback) {
                            event.currentTarget.src = fallback;
                          }
                        }}
                      />

                      <div className="min-w-0">

                        <div className="flex items-center gap-1">

                          <p className="text-sm font-bold text-[#151d19] truncate">

                            {product.producerName}

                          </p>

                        </div>

                        <p className="text-xs text-[#707972] truncate">

                          {product.producerAssociation}

                        </p>

                      </div>

                    </div>


                    {/* DIVIDER */}

                    <div className="my-4 border-t border-[#e4e9e5]" />


                    {/* PRICE */}

                    <div className="flex items-end justify-between gap-3">

                      <div>

                        <span className="
                          text-[10px]
                          uppercase
                          tracking-wider
                          text-[#707972]
                          font-bold
                        ">

                          Precio en finca

                        </span>

                        <div className="mt-0.5 flex items-baseline gap-1.5">

                          <span className="
                            font-display
                            font-bold
                            text-2xl
                            text-[#003622]
                          ">

                            {formatCop(product.priceCopKg)}

                          </span>

                          <span className="text-xs text-[#707972] font-medium">
                            COP / kg
                          </span>

                        </div>

                      </div>


                      {/* AVAILABLE STOCK */}

                      <div className="text-right">

                        <div className="flex items-center justify-end gap-1">

                          <Package className="w-3.5 h-3.5 text-[#003622]" />

                          <span className="text-[10px] font-bold text-[#707972] uppercase">
                            Disponible
                          </span>

                        </div>

                        <span className="text-xs font-bold text-[#151d19]">

                          {product.stockAvailableKg.toLocaleString(
                            'es-CO'
                          )}{' '}
                          kg

                        </span>

                      </div>

                    </div>

                    <div className="mt-3 rounded-xl bg-[#f7f6ef] px-3 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#707972]">
                        Referencia mayorista SIPSA
                      </p>
                      {officialReference ? (
                        <>
                          <p className="mt-1 text-sm font-bold text-[#003622]">
                            {formatCop(officialReference.meanPriceCop)} COP/kg
                          </p>
                          <p className="text-[10px] text-[#707972]">
                            {officialReference.market} ·{' '}
                            {new Date(`${officialReference.date}T00:00:00`).toLocaleDateString('es-CO')}
                            {priceReferences[product.name]?.fallbackToStoredData
                              ? ' · último dato guardado'
                              : ''}
                          </p>
                          {priceReferenceUrl && (
                            <a
                              href={priceReferenceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-block text-[10px] font-semibold text-[#32634b] underline underline-offset-2"
                            >
                              Fuente DANE
                            </a>
                          )}
                        </>
                      ) : (
                        <p className="mt-1 text-[10px] text-[#707972]">
                          {priceReferencesLoading
                            ? 'Consultando boletín oficial…'
                            : priceReferencesError
                              ? 'No se pudo consultar la fuente oficial.'
                              : 'Sin dato SIPSA disponible para este producto.'}
                        </p>
                      )}
                    </div>


                    {/* =================================================
                        ACTIONS
                    ================================================= */}

                    <div className="mt-5">

                      <a
                        id={`btn-detail-${product.id}`}
                        href={getProductPath(product)}
                        onClick={(event) => {
                          event.preventDefault();
                          onOpenProductModal(product);
                        }}
                        className="
                          w-full
                          bg-[#003622]
                          hover:bg-[#134e35]
                          text-white
                          py-2.5
                          px-3
                          rounded-xl
                          font-bold
                          text-xs
                          transition-all
                          flex
                          items-center
                          justify-center
                          gap-1.5
                          shadow-sm
                          hover:shadow-md
                        "
                        title="Ver la ficha del producto"
                      >

                        <Eye className="w-4 h-4 text-[#e8d9b7]" />
                        Ver producto
                        <ArrowRight className="w-4 h-4" />

                      </a>

                    </div>


                    {/* MINIMUM ORDER */}

                    <div className="mt-3 text-center">

                      <span className="text-[10px] text-[#8a938d]">

                        Pedido mínimo:{' '}

                        <strong className="text-[#56605a]">

                          {product.minOrderKg.toLocaleString(
                            'es-CO'
                          )}{' '}
                          kg

                        </strong>

                      </span>

                    </div>

                  </div>

                </article>

              );

            })}

          </div>

        )}

      </div>
    </section>
    </>
  );
};

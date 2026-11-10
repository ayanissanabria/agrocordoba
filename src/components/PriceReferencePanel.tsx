import React, { useEffect, useMemo, useState } from 'react';

interface PriceReference {
  productName: string;
  market: string;
  city: string;
  meanPriceCop: number;
  date: string;
}

interface PriceReferenceResponse {
  product: string;
  references: PriceReference[];
  reportDate: string;
  reportUrl: string;
  source: {
    name: string;
    datasetUrl: string;
    coverage: string;
    unit: string;
  };
}

interface PriceReferencePanelProps {
  productNames: string[];
}

const formatCop = (value: number) => new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
}).format(value);

export const PriceReferencePanel: React.FC<PriceReferencePanelProps> = ({ productNames }) => {
  const choices = useMemo(() => [...new Set(productNames.map((name) => name.trim()).filter(Boolean))].sort(), [productNames]);
  const [selectedProduct, setSelectedProduct] = useState(choices[0] || '');
  const [data, setData] = useState<PriceReferenceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!choices.includes(selectedProduct)) {
      setSelectedProduct(choices[0] || '');
    }
  }, [choices, selectedProduct]);

  useEffect(() => {
    if (!selectedProduct) {
      setData(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setData(null);
    fetch(`/api/price-references?product=${encodeURIComponent(selectedProduct)}`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'No se pudieron consultar los precios de referencia.');
        return payload as PriceReferenceResponse;
      })
      .then(setData)
      .catch((reason: Error) => {
        if (reason.name !== 'AbortError') setError(reason.message || 'No se pudieron consultar los precios de referencia.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [selectedProduct]);

  return (
    <section aria-labelledby="price-reference-title" className="rounded-xl border border-[#dce6de] bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#6b766f]">Datos abiertos del Estado</p>
          <h2 id="price-reference-title" className="mt-1 text-lg font-bold text-[#173b2b]">Precio de mercado de referencia</h2>
        </div>
        {choices.length > 0 && (
          <label className="text-xs font-semibold text-[#59645e]">
            Producto
            <select
              value={selectedProduct}
              onChange={(event) => setSelectedProduct(event.target.value)}
              className="ml-2 max-w-40 rounded-md border border-[#c9d6cd] bg-white px-2 py-1.5 text-sm text-[#18241d]"
            >
              {choices.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        )}
      </div>

      {choices.length === 0 ? (
        <p className="mt-3 text-sm text-[#59645e]">Publica o selecciona productos para consultar referencias.</p>
      ) : loading ? (
        <p role="status" className="mt-4 text-sm text-[#59645e]">Consultando el boletín oficial DANE-SIPSA…</p>
      ) : error ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : data?.references.length ? (
        <ul className="mt-3 divide-y divide-[#eef1eb]">
          {data.references.map((reference, index) => (
            <li key={`${reference.market}-${reference.date}-${index}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div>
                <p className="text-sm font-bold text-[#18241d]">{reference.productName}</p>
                <p className="text-xs text-[#59645e]">{reference.market || reference.city} · {reference.date}</p>
              </div>
              <p className="text-base font-bold text-[#1f4d36]">{formatCop(reference.meanPriceCop)}/{data.source.unit.replace('COP/', '')}</p>
            </li>
          ))}
        </ul>
      ) : data ? (
        <p className="mt-4 text-sm text-[#59645e]">La API no tiene registros para “{selectedProduct}”.</p>
      ) : null}

      {data && (
        <footer className="mt-3 border-t border-[#eef1eb] pt-3 text-[11px] leading-relaxed text-[#59645e]">
          <p>
            Fuente: <a className="font-semibold text-[#1f4d36] underline" href={data.reportUrl} target="_blank" rel="noreferrer">{data.source.name}</a>.
            Boletín: {data.reportDate}. Cobertura: {data.source.coverage}.
          </p>
          <p className="mt-1">Precios mayoristas en {data.source.unit}. <a className="font-semibold text-[#1f4d36] underline" href={data.source.datasetUrl} target="_blank" rel="noreferrer">Información SIPSA del DANE</a>.</p>
        </footer>
      )}
    </section>
  );
};

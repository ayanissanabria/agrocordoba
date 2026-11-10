import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Check, CheckCheck, MessageCircle, Send, X } from 'lucide-react';

import type {
  FulfillmentMethod,
  PaymentMethod,
  QuotationMessage,
  QuotationOffer,
  QuotationStatus,
} from '../types';

interface QuotationConversationProps {
  quotationId: string;
  currentUserId: string;
  participantName: string;
  productName: string;
  quotationStatus: QuotationStatus;
  initialUnitPrice: number;
  initialQuantityKg: number;
  initialFreightCop: number;
  fulfillmentMethod?: FulfillmentMethod;
  paymentMethod?: PaymentMethod;
  deliveryAddress?: string;
  deliveryLatitude?: number | null;
  deliveryLongitude?: number | null;
  producerPickupAddress?: string;
  compact?: boolean;
  autoOpen?: boolean;
  onAutoOpenHandled?: () => void;
}

interface PriceReference {
  productName: string;
  market: string;
  city: string;
  meanPriceCop: number;
  date: string;
}

interface PriceReferenceResponse {
  references: PriceReference[];
  reportDate: string;
  reportUrl: string;
  source: {
    name: string;
    datasetUrl: string;
    unit: string;
  };
}

interface JoinResponse {
  ok: boolean;
  error?: string;
  messages?: QuotationMessage[];
  participantOnline?: boolean;
}

interface SendResponse {
  ok: boolean;
  error?: string;
  message?: QuotationMessage;
}

interface OfferResponse {
  ok: boolean;
  error?: string;
  message?: QuotationMessage;
}

interface OfferUpdateResponse {
  ok: boolean;
  error?: string;
  messageId?: string;
  offer?: QuotationOffer;
}

interface ReadUpdate {
  messageIds: string[];
  readerId: string;
  readAt: string;
}

interface PresenceUpdate {
  userId: string;
  online: boolean;
}

interface TypingUpdate {
  userId: string;
  typing: boolean;
}

const cop = (amount: number) => new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
}).format(amount);

export const QuotationConversation: React.FC<QuotationConversationProps> = ({
  quotationId,
  currentUserId,
  participantName,
  productName,
  quotationStatus,
  initialUnitPrice,
  initialQuantityKg,
  initialFreightCop,
  fulfillmentMethod,
  paymentMethod,
  deliveryAddress,
  deliveryLatitude,
  deliveryLongitude,
  producerPickupAddress,
  compact = false,
  autoOpen = false,
  onAutoOpenHandled,
}) => {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<QuotationMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [connection, setConnection] = useState('Desconectado');
  const [participantOnline, setParticipantOnline] = useState(false);
  const [participantTyping, setParticipantTyping] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [offerFormOpen, setOfferFormOpen] = useState(false);
  const [unitPriceCop, setUnitPriceCop] = useState(initialUnitPrice);
  const [quantityKg, setQuantityKg] = useState(initialQuantityKg);
  const [freightCop, setFreightCop] = useState(initialFreightCop);
  const [priceData, setPriceData] = useState<PriceReferenceResponse | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const endOfMessagesRef = useRef<HTMLDivElement | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remoteTypingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onAutoOpenHandledRef = useRef(onAutoOpenHandled);

  useEffect(() => {
    onAutoOpenHandledRef.current = onAutoOpenHandled;
  }, [onAutoOpenHandled]);

  useEffect(() => {
    if (autoOpen) {
      setOpen(true);
      onAutoOpenHandledRef.current?.();
    }
  }, [autoOpen, quotationId]);

  useEffect(() => {
    if (!open) return;

    const socket = io({ autoConnect: false, withCredentials: true });
    socketRef.current = socket;
    setConnection('Conectando…');
    setError('');

    socket.on('connect', () => {
      socket.emit('quotation:join', { quotationId }, (response: JoinResponse) => {
        if (!response?.ok) {
          setConnection('Sin acceso');
          setError(response?.error || 'No se pudo abrir esta conversación.');
          return;
        }
        setMessages(response.messages || []);
        setParticipantOnline(response.participantOnline || false);
        setConnection('En línea');
      });
    });
    socket.on('quotation:message', (message: QuotationMessage) => {
      setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
    });
    socket.on('quotation:read', (update: ReadUpdate) => {
      const readIds = new Set(update.messageIds);
      setMessages((current) => current.map((message) => (
        readIds.has(message.id) ? { ...message, readAt: update.readAt } : message
      )));
    });
    socket.on('quotation:presence', (update: PresenceUpdate) => {
      if (update.userId !== currentUserId) setParticipantOnline(update.online);
    });
    socket.on('quotation:typing', (update: TypingUpdate) => {
      if (update.userId === currentUserId) return;
      setParticipantTyping(update.typing);
      if (remoteTypingTimerRef.current) clearTimeout(remoteTypingTimerRef.current);
      if (update.typing) {
        remoteTypingTimerRef.current = setTimeout(() => setParticipantTyping(false), 2500);
      }
    });
    socket.on('quotation:offer:updated', (update: OfferUpdateResponse) => {
      const updatedOffer = update.offer;
      if (!update.messageId || !updatedOffer) return;
      setMessages((current) => current.map((message) => message.id === update.messageId
        ? { ...message, offer: updatedOffer }
        : message));
    });
    socket.on('connect_error', () => {
      setConnection('Desconectado');
      setError('No se pudo conectar al chat. Comprueba tu sesión e inténtalo de nuevo.');
    });
    socket.on('disconnect', () => {
      setConnection('Desconectado');
      setParticipantOnline(false);
      setParticipantTyping(false);
      setSending(false);
    });
    socket.connect();

    return () => {
      if (socket.connected) socket.emit('quotation:typing', { quotationId, typing: false });
      socket.disconnect();
      socketRef.current = null;
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (remoteTypingTimerRef.current) clearTimeout(remoteTypingTimerRef.current);
    };
  }, [open, quotationId, currentUserId]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setPriceData(null);
    setPriceLoading(true);
    setPriceError('');
    fetch(`/api/price-references?product=${encodeURIComponent(productName)}`, {
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'No se pudo consultar el precio SIPSA.');
        return payload as PriceReferenceResponse;
      })
      .then(setPriceData)
      .catch((reason: Error) => {
        if (reason.name !== 'AbortError') setPriceError(reason.message || 'No se pudo consultar el precio SIPSA.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setPriceLoading(false);
      });
    return () => controller.abort();
  }, [open, productName]);

  useEffect(() => {
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const sendMessage = (event: React.FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    const socket = socketRef.current;
    if (!socket?.connected) {
      setError('El chat está desconectado. Espera a que se restablezca la conexión.');
      return;
    }

    socket.emit('quotation:typing', { quotationId, typing: false });
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    setSending(true);
    setError('');
    socket.emit('quotation:send', { quotationId, content }, (response: SendResponse) => {
      setSending(false);
      if (!response?.ok) {
        setError(response?.error || 'No se pudo enviar el mensaje.');
        return;
      }
      const sentMessage = response.message;
      if (sentMessage) {
        setMessages((current) => current.some((item) => item.id === sentMessage.id)
          ? current
          : [...current, sentMessage]);
      }
      setDraft('');
    });
  };

  const updateDraft = (value: string) => {
    setDraft(value);
    const socket = socketRef.current;
    if (!socket?.connected) return;
    socket.emit('quotation:typing', { quotationId, typing: value.trim().length > 0 });
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    if (value.trim()) {
      typingTimerRef.current = setTimeout(() => {
        socket.emit('quotation:typing', { quotationId, typing: false });
      }, 1200);
    }
  };

  const sendOffer = (event: React.FormEvent) => {
    event.preventDefault();
    const socket = socketRef.current;
    if (!socket?.connected || sending) {
      setError('El chat debe estar conectado para enviar una oferta.');
      return;
    }
    setSending(true);
    setError('');
    socket.emit(
      'quotation:offer',
      { quotationId, unitPriceCop, quantityKg, freightCop },
      (response: OfferResponse) => {
        setSending(false);
        if (!response?.ok) {
          setError(response?.error || 'No se pudo registrar la oferta.');
          return;
        }
        const sentMessage = response.message;
        if (sentMessage) {
          setMessages((current) => current.some((item) => item.id === sentMessage.id)
            ? current
            : [...current, sentMessage]);
        }
        setOfferFormOpen(false);
      },
    );
  };

  const respondToOffer = (offerId: string, action: 'accept' | 'reject') => {
    const socket = socketRef.current;
    if (!socket?.connected || sending) {
      setError('El chat debe estar conectado para responder la oferta.');
      return;
    }
    setSending(true);
    setError('');
    socket.emit('quotation:offer:respond', { offerId, action }, (response: OfferUpdateResponse) => {
      setSending(false);
      if (!response?.ok) {
        setError(response?.error || 'No se pudo actualizar la oferta.');
        return;
      }
      const updatedOffer = response.offer;
      if (response.messageId && updatedOffer) {
        setMessages((current) => current.map((message) => message.id === response.messageId
          ? { ...message, offer: updatedOffer }
          : message));
      }
    });
  };

  const reference = priceData?.references[0];
  const hasOpenNegotiation = quotationStatus !== 'Acordado' && quotationStatus !== 'Cerrado';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center justify-center gap-2 rounded-lg border border-[#c9d6cd] text-sm font-bold text-[#004d36] hover:bg-[#f2f7f2] ${compact ? 'px-2.5 py-1.5' : 'px-4 py-2.5'}`}
      >
        <MessageCircle size={16} />
        {compact ? 'Abrir chat' : 'Conversación en AgroCórdoba'}
      </button>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={`conversation-title-${quotationId}`}
            className="flex h-[min(680px,92vh)] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
          >
            <header className="flex items-center justify-between border-b border-[#e2e7df] px-4 py-3">
              <div>
                <h2 id={`conversation-title-${quotationId}`} className="font-bold text-[#173b2b]">
                  Conversación con {participantName}
                </h2>
                <p className="mt-0.5 text-xs text-[#59645e]">
                  {connection === 'En línea'
                    ? participantTyping
                      ? `${participantName} está escribiendo…`
                      : participantOnline
                        ? `${participantName} está en línea`
                        : `${participantName} no está en línea`
                    : connection}
                  {' · Cotización '}{quotationId.slice(0, 8)}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar conversación" className="rounded p-2 text-[#59645e] hover:bg-[#f2f7f2]">
                <X size={18} />
              </button>
            </header>

            <div className="flex-1 space-y-3 overflow-y-auto bg-[#f6f7f3] p-4" aria-live="polite">
              <section className="rounded-xl border border-[#dce6de] bg-white p-3" aria-label="Condiciones del pedido">
                <h3 className="text-sm font-bold text-[#173b2b]">Condiciones del pedido</h3>
                <p className="mt-1 text-xs text-[#285b3c]">
                  Estado del negocio: <b>{quotationStatus}</b>
                  {quotationStatus === 'Cerrado' && ' · recepción confirmada por el comprador'}
                  {quotationStatus === 'Entregado' && ' · falta que el comprador confirme la recepción'}
                  {quotationStatus === 'Listo para recoger' && ' · falta que el comprador confirme la recogida'}
                  {quotationStatus === 'Acordado' && ' · falta registrar la entrega o preparar la recogida'}
                </p>
                <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-[#59645e]">Entrega</dt>
                    <dd className="font-semibold text-[#18241d]">
                      {fulfillmentMethod === 'recoger' ? 'Recoger en finca' : 'Domicilio'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#59645e]">Pago preferido</dt>
                    <dd className="font-semibold text-[#18241d]">
                      {paymentMethod === 'efectivo' ? 'Efectivo' : 'Transferencia'}
                    </dd>
                  </div>
                </dl>
                {fulfillmentMethod === 'domicilio' && (
                  deliveryAddress ? (
                    <div className="mt-2 border-t border-[#eef1eb] pt-2 text-xs">
                      <p><b>Dirección de entrega:</b> {deliveryAddress}</p>
                      {deliveryLatitude != null && deliveryLongitude != null && (
                        <a
                          className="mt-1 inline-block font-semibold text-[#1f4d36] underline"
                          href={`https://www.openstreetmap.org/?mlat=${deliveryLatitude}&mlon=${deliveryLongitude}#map=17/${deliveryLatitude}/${deliveryLongitude}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Ver pin de entrega
                        </a>
                      )}
                    </div>
                  ) : (
                    <p className="mt-2 border-t border-[#eef1eb] pt-2 text-xs text-[#59645e]">
                      La dirección exacta se mostrará aquí cuando la oferta quede acordada.
                    </p>
                  )
                )}
                {fulfillmentMethod === 'recoger' && (
                  <p className="mt-2 border-t border-[#eef1eb] pt-2 text-xs text-[#59645e]">
                    {producerPickupAddress
                      ? <><b>Punto de recogida:</b> {producerPickupAddress}</>
                      : 'La dirección privada de recogida se mostrará aquí cuando la oferta quede acordada.'}
                  </p>
                )}
                <p className="mt-2 text-[11px] text-[#59645e]">
                  El pago se acuerda directamente entre las partes; AgroCórdoba no procesa pagos.
                </p>
              </section>
              {messages.length === 0 && !error && (
                <p className="mx-auto mt-8 max-w-sm text-center text-sm text-[#59645e]">
                  {connection === 'En línea' ? 'Aún no hay mensajes. Inicia la conversación sobre esta cotización.' : 'Conectando con el otro participante…'}
                </p>
              )}
              {messages.map((message) => {
                const isOwn = message.senderId === currentUserId;
                const offer = message.offer;
                return (
                  <article key={message.id} className={`w-full max-w-[90%] rounded-2xl px-3.5 py-2.5 shadow-sm ${isOwn ? 'ml-auto bg-[#dff2e5]' : 'bg-white'}`}>
                    <p className="text-xs font-bold text-[#285b3c]">{isOwn ? 'Tú' : message.senderName}</p>
                    {offer ? (
                      <div className="mt-2 rounded-xl border border-[#dce6de] bg-white p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-bold text-[#173b2b]">{offer.status === 'Contraofertada' ? 'Oferta anterior' : 'Oferta estructurada'}</p>
                          <span className="rounded-full bg-[#eef5f0] px-2 py-0.5 text-[11px] font-semibold text-[#285b3c]">{offer.status}</span>
                        </div>
                        <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                          <div><dt className="text-xs text-[#59645e]">Precio por kg</dt><dd className="font-bold">{cop(offer.unitPriceCop)}</dd></div>
                          <div><dt className="text-xs text-[#59645e]">Cantidad</dt><dd className="font-bold">{offer.quantityKg.toLocaleString('es-CO')} kg</dd></div>
                          <div><dt className="text-xs text-[#59645e]">Transporte</dt><dd className="font-semibold">{cop(offer.freightCop)}</dd></div>
                          <div><dt className="text-xs text-[#59645e]">Total ofrecido</dt><dd className="font-bold text-[#173b2b]">{cop(offer.totalCop)}</dd></div>
                        </dl>
                        <div className="mt-3 border-t border-[#eef1eb] pt-2 text-xs text-[#59645e]">
                          {offer.priceReference ? (
                            <>
                              <p className="font-bold text-[#285b3c]">Referencia mayorista oficial (DANE · SIPSA)</p>
                              <p>{cop(offer.priceReference.priceCopKg)}/kg · {offer.priceReference.market} · {offer.priceReference.date}</p>
                              <a className="mt-1 inline-block font-semibold text-[#1f4d36] underline" href={offer.priceReference.sourceUrl} target="_blank" rel="noreferrer">Ver anexo oficial</a>
                            </>
                          ) : (
                            <div>
                              <p className="font-bold text-amber-900">Sin precio oficial comparable</p>
                              <p>{offer.priceReferenceUnavailable?.reason || 'El DANE-SIPSA no tenía una referencia comparable al enviar esta oferta.'}</p>
                              {offer.priceReferenceUnavailable?.date && <p>Boletín consultado: {offer.priceReferenceUnavailable.date}.</p>}
                              <a className="mt-1 inline-block font-semibold text-[#1f4d36] underline" href={offer.priceReferenceUnavailable?.sourceUrl || 'https://www.dane.gov.co/index.php/estadisticas-por-tema/agropecuario/sistema-de-informacion-de-precios-sipsa/componente-precios-mayoristas'} target="_blank" rel="noreferrer">Consultar DANE-SIPSA</a>
                            </div>
                          )}
                        </div>
                        {!isOwn && offer.status === 'Pendiente' && hasOpenNegotiation && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" disabled={sending} onClick={() => respondToOffer(offer.id, 'accept')} className="rounded-lg bg-[#004d36] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Aceptar</button>
                            <button type="button" disabled={sending} onClick={() => respondToOffer(offer.id, 'reject')} className="rounded-lg border border-[#c9d6cd] px-3 py-1.5 text-xs font-bold text-[#3d4a42] disabled:opacity-50">Rechazar</button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[#18241d]">{message.content}</p>
                    )}
                    <time className="mt-1 block text-right text-[10px] text-[#6b766f]">
                      {new Date(message.createdAt).toLocaleString('es-CO')}
                    </time>
                    {isOwn && (
                      <span className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${message.readAt ? 'text-[#1677b8]' : 'text-[#6b766f]'}`}>
                        {message.readAt ? <CheckCheck size={13} aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}
                        {message.readAt ? 'Visto' : 'Enviado'}
                      </span>
                    )}
                  </article>
                );
              })}
              <div ref={endOfMessagesRef} />
            </div>

            {error && <p role="alert" className="border-t border-red-100 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</p>}
            {hasOpenNegotiation && (
              <div className="border-t border-[#e2e7df] bg-white px-3 pt-3">
                {!offerFormOpen ? (
                  <button type="button" onClick={() => setOfferFormOpen(true)} className="mb-3 w-full rounded-lg border border-[#1f4d36] px-3 py-2 text-sm font-bold text-[#1f4d36] hover:bg-[#f2f7f2]">
                    Proponer precio / contraoferta
                  </button>
                ) : (
                  <form onSubmit={sendOffer} className="mb-3 space-y-3 rounded-xl bg-[#f6f7f3] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-[#173b2b]">Oferta estructurada · {productName}</h3>
                      <button type="button" onClick={() => setOfferFormOpen(false)} className="text-xs font-semibold text-[#59645e] underline">Cancelar</button>
                    </div>
                    {reference ? (
                      <p className="rounded-lg border border-[#dce6de] bg-white px-3 py-2 text-xs text-[#3d4a42]">
                        Precio DANE-SIPSA: <b>{cop(reference.meanPriceCop)}/kg</b> · {reference.market} · {reference.date}
                      </p>
                    ) : (
                      <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        {priceLoading
                          ? 'Consultando el último precio oficial SIPSA…'
                          : priceError
                            ? priceError
                            : 'El último anexo SIPSA no informa un precio comparable. Puedes enviar la oferta; se mostrará claramente que no tiene referencia.'}
                      </p>
                    )}
                    <div className="grid grid-cols-3 gap-2">
                      <label className="text-xs font-semibold text-[#59645e]">Precio/kg (COP)
                        <input required type="number" min="1" step="1" value={unitPriceCop} onChange={(event) => setUnitPriceCop(Number(event.target.value))} className="mt-1 w-full rounded-md border border-[#c9d6cd] bg-white px-2 py-2 text-sm text-[#18241d]" />
                      </label>
                      <label className="text-xs font-semibold text-[#59645e]">Cantidad (kg)
                        <input required type="number" min="1" step="1" value={quantityKg} onChange={(event) => setQuantityKg(Number(event.target.value))} className="mt-1 w-full rounded-md border border-[#c9d6cd] bg-white px-2 py-2 text-sm text-[#18241d]" />
                      </label>
                      <label className="text-xs font-semibold text-[#59645e]">Transporte (COP)
                        <input required type="number" min="0" step="1" value={freightCop} onChange={(event) => setFreightCop(Number(event.target.value))} className="mt-1 w-full rounded-md border border-[#c9d6cd] bg-white px-2 py-2 text-sm text-[#18241d]" />
                      </label>
                    </div>
                    <p className="text-right text-sm font-bold text-[#173b2b]">Total: {cop(unitPriceCop * quantityKg + freightCop)}</p>
                    <button type="submit" disabled={sending || priceLoading || connection !== 'En línea'} className="w-full rounded-lg bg-[#004d36] px-3 py-2 text-sm font-bold text-white hover:bg-[#003622] disabled:cursor-not-allowed disabled:opacity-50">
                      {reference ? 'Enviar oferta con referencia SIPSA' : priceLoading ? 'Consultando SIPSA…' : 'Enviar oferta sin referencia SIPSA'}
                    </button>
                    <p className="text-[10px] leading-relaxed text-[#59645e]">Fuente consultada: {priceData?.source.name || 'DANE — SIPSA'}. Los precios oficiales disponibles se expresan en COP/kg.</p>
                  </form>
                )}
              </div>
            )}
            <form onSubmit={sendMessage} className="flex items-end gap-2 border-t border-[#e2e7df] bg-white p-3">
              <label className="sr-only" htmlFor={`conversation-message-${quotationId}`}>Escribe un mensaje</label>
              <textarea
                id={`conversation-message-${quotationId}`}
                value={draft}
                onChange={(event) => updateDraft(event.target.value)}
                onBlur={() => {
                  socketRef.current?.emit('quotation:typing', { quotationId, typing: false });
                  if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
                }}
                maxLength={2000}
                rows={2}
                placeholder="Escribe tu mensaje…"
                className="min-h-11 flex-1 resize-none rounded-lg border border-[#c9d6cd] px-3 py-2 text-sm outline-none focus:border-[#004d36] focus:ring-2 focus:ring-[#b4f0cd]"
              />
              <button
                type="submit"
                disabled={!draft.trim() || sending || connection !== 'En línea'}
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#004d36] px-4 text-sm font-bold text-white hover:bg-[#003622] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Send size={15} />
                Enviar
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
};

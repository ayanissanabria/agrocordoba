import React from 'react';
import { Search, ShoppingCart, MessageSquare, Truck, ShieldCheck, ArrowRight, CheckCircle2, Users } from 'lucide-react';

interface HowItWorksProps {
  onExploreCatalog: () => void;
  onOpenAuth: (mode?: 'login' | 'register') => void;
}

export const HowItWorks: React.FC<HowItWorksProps> = ({ onExploreCatalog, onOpenAuth }) => {
  const steps = [
    {
      step: '01',
      badge: 'Explora Cosechas',
      title: 'Encuentra productos de la región',
      desc: 'Explora las fichas disponibles y compara el origen, el precio publicado y la referencia mayorista oficial.',
      icon: Search,
      color: 'from-emerald-600 to-[#003622]',
      bgLight: 'bg-[#f4f2e9]',
      border: 'border-[#e4dfd2]',
      tag: 'Origen local',
    },
    {
      step: '02',
      badge: 'Crea tu Cuenta',
      title: 'Cuéntanos qué tipo de comprador eres',
      desc: 'Crea tu perfil con tus datos de contacto y la información básica de tu negocio para facilitar la conversación.',
      icon: Users,
      color: 'from-[#134e35] to-[#002b1b]',
      bgLight: 'bg-[#f4f2e9]',
      border: 'border-[#e4dfd2]',
      tag: 'Perfil de comprador',
    },
    {
      step: '03',
      badge: 'Cotiza por Volumen',
      title: 'Envía una solicitud de cotización',
      desc: 'Indica la cantidad que necesitas. El productor podrá confirmar disponibilidad, precio final y condiciones de entrega.',
      icon: ShoppingCart,
      color: 'from-amber-600 to-[#9b4500]',
      bgLight: 'bg-[#f8f1e4]',
      border: 'border-[#e9ddc5]',
      tag: 'A tu medida',
    },
    {
      step: '04',
      badge: 'Chat en AgroCórdoba',
      title: 'Negocia dentro de la plataforma',
      desc: 'Conversa en tiempo real, envía contraofertas estructuradas y conserva el estado de cada cotización.',
      icon: MessageSquare,
      color: 'from-emerald-700 to-[#134e35]',
      bgLight: 'bg-[#f4f2e9]',
      border: 'border-[#e4dfd2]',
      tag: 'Mensajes en tiempo real',
    },
  ];

  return (
    <section id="como-funciona" className="border-y border-[#e4dfd2] bg-gradient-to-b from-[#fbfaf6] via-[#f2f0e7] to-[#fbfaf6] py-16 sm:py-20">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-[#e8d9b7] text-[#003622] px-3.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-3">
            <ShieldCheck className="w-4 h-4 text-[#003622]" />
            Cómo comprar
          </div>
          <h2 className="font-editorial text-2xl sm:text-3xl lg:text-4xl font-bold text-[#151d19] tracking-tight">
            Así funciona la compra directa
          </h2>
          <p className="mt-3 text-sm sm:text-base text-[#404943] leading-relaxed">
            Un proceso sencillo para encontrar productos de Córdoba y conversar directamente con quien los produce.
          </p>
        </div>

        {/* 4 Steps Grid */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((item, idx) => {
            const IconComponent = item.icon;
            return (
              <div
                key={idx}
                className={`relative rounded-2xl ${item.bgLight} border ${item.border} p-6 flex flex-col justify-between hover:shadow-lg transition-all duration-300 group`}
              >
                <div>
                  {/* Step header */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="font-display font-extrabold text-2xl text-[#134e35]/30 group-hover:text-[#003622] transition-colors">
                      {item.step}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-white text-[#003622] px-2.5 py-0.5 rounded-full border border-[#e4dfd2]/50 shadow-2xs">
                      {item.tag}
                    </span>
                  </div>

                  {/* Icon Circle */}
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.color} text-white flex items-center justify-center mb-4 shadow-sm group-hover:scale-105 transition-transform`}>
                    <IconComponent className="w-6 h-6" />
                  </div>

                  {/* Step badge */}
                  <span className="text-xs font-bold text-[#9b4500] uppercase tracking-wide block mb-1">
                    {item.badge}
                  </span>

                  {/* Title & Desc */}
                  <h3 className="font-display font-bold text-base text-[#151d19] mb-2 leading-snug">
                    {item.title}
                  </h3>
                  <p className="text-xs text-[#525d56] leading-relaxed">
                    {item.desc}
                  </p>
                </div>

                {/* Sub-indicator */}
                <div className="mt-6 pt-4 border-t border-black/5 flex items-center text-xs font-medium text-[#134e35]">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mr-1.5 shrink-0" />
                  <span className="text-[11px] text-[#404943]">Tú decides cómo avanzar</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Action callout banner */}
        <div className="mt-12 bg-gradient-to-r from-[#003622] via-[#134e35] to-[#003622] rounded-2xl p-6 sm:p-8 text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl border border-[#e8d9b7]/20">
          <div className="max-w-xl text-center md:text-left">
            <span className="text-xs font-bold text-[#e8d9b7] uppercase tracking-wider block mb-1">
              ¿Buscas productos de Córdoba?
            </span>
            <h3 className="text-xl sm:text-2xl font-display font-bold text-white leading-tight">
              Revisa el catálogo y encuentra una cosecha para tu negocio
            </h3>
            <p className="text-xs sm:text-sm text-[#f7f6ef]/80 mt-1.5">
              Consulta los productos publicados y solicita información directamente al productor.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 shrink-0">
            <button
              id="cta-how-it-works-register"
              onClick={() => onOpenAuth('register')}
              className="bg-[#e8d9b7] hover:bg-white text-[#003622] font-bold text-xs sm:text-sm px-5 py-2.5 rounded-xl shadow-md transition flex items-center gap-2"
            >
              <span>Crear Cuenta Gratis</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              id="cta-how-it-works-catalog"
              onClick={onExploreCatalog}
              className="bg-white/10 hover:bg-white/20 text-white border border-white/20 font-semibold text-xs sm:text-sm px-4 py-2.5 rounded-xl transition"
            >
              Ver Cosechas Disponibles
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight,
  CirclePlay, LayoutDashboard, MessageCircle,
  Play, QrCode, ShieldCheck, Smartphone, Sparkles, X,
} from 'lucide-react';
import { catalog } from '../demo/catalog';
import { AuthSession, RestaurantTenant } from '../types';
import {
  ConsentStatus, getConsentStatus, initGA4, setConsentStatus, trackConversionEvent,
} from '../utils/analytics';

interface LandingPageViewProps {
  tenant: RestaurantTenant;
  authSession: AuthSession | null;
  onNavigateToLogin: () => void;
  onNavigateToSetup: (plan?: 'YEARLY') => void;
  onNavigateToAdmin: () => void;
  onNavigateToTerms?: () => void;
  onNavigateToPrivacy?: () => void;
}

interface DemoScreen {
  id: string;
  label: string;
  eyebrow: string;
  description: string;
  image: string;
  imageAlt: string;
}

interface Reel {
  id: string;
  title: string;
  poster: string;
  posterAlt: string;
  videoSrc?: string;
}

const PRODUCT_CAPTURE = '/assets/landing/aladay-produtos.webp';
const CART_CAPTURE = '/assets/landing/aladay-carrinho.webp';
const ADMIN_CAPTURE = '/assets/landing/aladay-demo-painel.webp';
const PHONE_CAPTURE = '/assets/landing/aladay-cardapio.webp';
const WHATSAPP_CAPTURE = '/assets/landing/aladay-whatsapp.webp';

const FEATURES = [
  { icon: QrCode, title: 'No salão', description: 'Compartilhe o QR Code na mesa ou no balcão para o cliente abrir o cardápio pelo celular.' },
  { icon: MessageCircle, title: 'No delivery', description: 'Divulgue o link do seu cardápio e envie atualizações do pedido pelo WhatsApp.' },
  { icon: LayoutDashboard, title: 'Na cozinha', description: 'Acompanhe os pedidos no painel e atualize o status conforme o preparo avança.' },
];

const DEMO_SCREENS: DemoScreen[] = [
  {
    id: 'menu', label: 'Cardápio', eyebrow: 'Descoberta sem atrito',
    description: 'Categorias, fotos, adicionais e preços apresentados para uma decisão rápida no celular.',
    image: PHONE_CAPTURE, imageAlt: 'Captura real do cardápio digital Aladay em um smartphone',
  },
  {
    id: 'cart', label: 'Carrinho', eyebrow: 'Pedido organizado',
    description: 'O cliente confere itens e valores antes de avançar, em uma jornada pensada para telas pequenas.',
    image: CART_CAPTURE, imageAlt: 'Captura real do carrinho e checkout do cardápio Aladay',
  },
  {
    id: 'management', label: 'Gestão', eyebrow: 'Operação centralizada',
    description: 'O restaurante gerencia o serviço em um painel próprio, separado da experiência do cliente.',
    image: ADMIN_CAPTURE, imageAlt: 'Captura do painel demonstrativo Aladay',
  },
];

const REELS: Reel[] = [
  { id: 'digital-menu', title: 'O cardápio na mão do cliente', poster: PHONE_CAPTURE, posterAlt: 'Prévia vertical do cardápio digital Aladay' },
  { id: 'order-flow', title: 'Do produto ao carrinho', poster: PRODUCT_CAPTURE, posterAlt: 'Prévia vertical da seleção de produtos no Aladay' },
  { id: 'whatsapp', title: 'Atualizações pelo WhatsApp', poster: WHATSAPP_CAPTURE, posterAlt: 'Prévia vertical do atendimento pelo WhatsApp' },
  { id: 'restaurant-panel', title: 'A rotina no painel', poster: ADMIN_CAPTURE, posterAlt: 'Captura do painel demonstrativo Aladay' },
];

const FAQS = [
  {
    question: 'Como o cliente acessa o cardápio digital?',
    answer: 'Cada restaurante possui um link próprio. O cliente pode abrir esse link ou escanear o QR Code disponibilizado pela loja, sem instalar aplicativo.',
  },
  {
    question: 'Os pedidos podem ser acompanhados pelo WhatsApp?',
    answer: 'Sim. A plataforma possui automações de WhatsApp para a comunicação do pedido e das atualizações de status, conforme a configuração da operação.',
  },
  {
    question: 'A Aladay cobra comissão sobre as vendas diretas?',
    answer: 'Não. Nos planos apresentados, a Aladay cobra uma assinatura fixa e não retém comissão sobre os pedidos diretos feitos no cardápio da loja.',
  },
  {
    question: 'O Pix cai na conta do restaurante?',
    answer: 'Sim. O QR Code Pix é gerado com a chave configurada pelo próprio restaurante, para pagamento direto na conta bancária informada pela loja.',
  },
  {
    question: 'Preciso ter CNPJ para começar?',
    answer: 'Não é obrigatório. O cadastro pode ser realizado com CPF ou CNPJ, e a loja pode usar uma chave Pix válida compatível com sua operação.',
  },
  {
    question: 'Como funciona o teste gratuito?',
    answer: 'Você pode testar a plataforma por 15 dias sem informar um cartão. Ao fim do teste, escolha um plano para continuar usando a Aladay.',
  },
];

const FadeIn = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? undefined : { opacity: 0, y: 22 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

export const LandingPageView: React.FC<LandingPageViewProps> = ({
  tenant,
  authSession,
  onNavigateToLogin,
  onNavigateToSetup,
  onNavigateToAdmin,
  onNavigateToTerms,
  onNavigateToPrivacy,
}) => {
  const reduceMotion = useReducedMotion();
  const reelsRef = useRef<HTMLDivElement>(null);
  const [cookieConsent, setCookieConsent] = useState<ConsentStatus>('pending');
  const [activeDemo, setActiveDemo] = useState(DEMO_SCREENS[0]);
  const [activeReel, setActiveReel] = useState<Reel | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [planCycle, setPlanCycle] = useState<'YEARLY' | 'MONTHLY'>('MONTHLY');
  const [monthlyOrders, setMonthlyOrders] = useState(450);
  const [averageTicket, setAverageTicket] = useState(68);
  const [marketplaceFee, setMarketplaceFee] = useState(18);

  useEffect(() => {
    const status = getConsentStatus();
    setCookieConsent(status);
    if (status === 'granted') initGA4();
    trackConversionEvent('page_view', { page_name: 'landing_home_2_0', tenant_slug: tenant.slug });
  }, [tenant.slug]);

  const reelDialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (activeReel && !reelDialog.current?.open) reelDialog.current?.showModal();
  }, [activeReel]);

  const monthlySavings = useMemo(() => {
    const marketplaceCost = monthlyOrders * averageTicket * (marketplaceFee / 100);
    const aladayCost = planCycle === 'YEARLY' ? 99 : 129.9;
    return Math.max(0, marketplaceCost - aladayCost);
  }, [averageTicket, marketplaceFee, monthlyOrders, planCycle]);

  const formatBRL = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const demoProduct = catalog[0];
  const demoPrice = formatBRL(demoProduct.price / 100);

  const handleSignup = (source: string, cycle: 'YEARLY' | 'MONTHLY' = 'MONTHLY') => {
    trackConversionEvent('click_signup', {
      source,
      plan: cycle === 'YEARLY' ? 'pro_99_yearly' : 'pro_129_90',
    });
    onNavigateToSetup(cycle === 'YEARLY' ? 'YEARLY' : undefined);
  };

  const openSupportWhatsApp = () => {
    trackConversionEvent('click_whatsapp_contact', { source: 'landing_2_0' });
    const message = encodeURIComponent('Olá! Gostaria de conhecer a Aladay para digitalizar o meu restaurante.');
    window.open(`https://wa.me/559131976334?text=${message}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="aladay-landing -mx-4 -mt-4 overflow-hidden bg-[#f5f7fa] text-slate-950 sm:-mx-6 sm:-mt-6">
      <section className="overflow-hidden border-b border-aladay-line bg-aladay-brand-soft">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-5 py-12 sm:px-10 sm:py-16 lg:grid-cols-[.9fr_1.1fr] lg:gap-10 lg:px-12 lg:py-24">
          <div className="min-w-0">
            <h1 className="max-w-xl text-[clamp(2.4rem,5.7vw,4.15rem)] font-extrabold leading-[1.06] tracking-[-.055em] text-aladay-ink">
              Do cardápio digital ao pedido pronto.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-700 sm:text-lg">
              Compartilhe seu cardápio por QR Code, acompanhe pedidos no painel e envie atualizações pelo WhatsApp.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button type="button" onClick={() => handleSignup('hero_primary')} className="aladay-action aladay-action-primary">
                Testar grátis por 15 dias <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
              <a href="/demo" onClick={() => trackConversionEvent('view_demo_menu', { source: 'hero_secondary' })} className="aladay-action border border-blue-200 bg-white text-aladay-ink hover:bg-blue-100">
                <CirclePlay className="h-4 w-4" aria-hidden="true" /> Fazer um pedido na demo
              </a>
            </div>
            <p className="mt-4 text-sm text-slate-600">Sem cartão para começar.</p>
          </div>
          <figure className="min-w-0 rounded-3xl border border-blue-200 bg-gradient-to-br from-white via-white to-orange-50 p-4 shadow-xl shadow-blue-950/10 sm:p-6">
            <figcaption className="mb-4 text-sm font-semibold text-slate-600">Um pedido na demonstração</figcaption>
            <div className="grid items-center gap-3 min-[480px]:grid-cols-[.85fr_auto_1fr]">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <p className="flex items-center gap-2 px-4 py-3 text-sm font-bold text-aladay-ink">
                  <Smartphone className="size-4 text-aladay-brand" aria-hidden="true" /> No celular
                </p>
                <img src={demoProduct.image} alt="" className="aspect-[16/9] w-full object-cover" fetchPriority="high" decoding="async" />
                <div className="flex flex-wrap justify-between gap-x-3 px-4 py-3 text-sm text-slate-900">
                  <span className="font-semibold">{demoProduct.name}</span>
                  <strong>{demoPrice}</strong>
                </div>
              </div>
              <ArrowRight aria-hidden="true" className="mx-auto size-5 rotate-90 text-blue-700 min-[480px]:rotate-0" />
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <p className="flex items-center gap-2 bg-aladay-ink px-4 py-3 text-sm font-bold text-white">
                  <LayoutDashboard className="size-4" aria-hidden="true" /> No painel da cozinha
                </p>
                <div className="space-y-3 px-4 py-4 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-600">#DEMO-001</span>
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">Em preparo</span>
                  </div>
                  <div className="flex flex-wrap justify-between gap-x-3 border-t border-slate-200 pt-3 text-slate-900">
                    <span>1 × {demoProduct.name}</span>
                    <strong>{demoPrice}</strong>
                  </div>
                </div>
              </div>
            </div>
          </figure>
        </div>
      </section>

      <section aria-label="Diferenciais comerciais" className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-slate-200 px-6 sm:grid-cols-4 sm:px-10 lg:px-12">
          {[
            ['0%', 'comissão nas vendas diretas'],
            ['15 dias', 'de teste sem cartão'],
            ['R$ 99', 'por mês no plano anual'],
            ['24/7', 'cardápio disponível online'],
          ].map(([value, label]) => (
            <div key={value} className="px-4 py-7 text-center"><p className="text-2xl font-extrabold">{value}</p><p className="mt-1 text-[11px] font-semibold text-slate-500">{label}</p></div>
          ))}
        </div>
      </section>

      <section className="px-6 py-20 sm:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <FadeIn className="max-w-3xl">
            <p className="text-xs font-extrabold uppercase text-blue-600">Da vitrine à cozinha</p>
            <h2 className="mt-4 text-3xl font-extrabold leading-tight sm:text-5xl">Do atendimento à cozinha</h2>
          </FadeIn>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <FadeIn key={feature.title} className="group rounded-2xl border border-slate-200 bg-white p-7 transition-colors hover:bg-slate-50">
                <div className="flex h-11 w-11 items-center justify-center bg-slate-950 text-white transition-colors group-hover:bg-blue-600"><feature.icon className="h-5 w-5" /></div>
                <h3 className="mt-4 text-lg font-bold">{feature.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{feature.description}</p>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <section id="demonstracao-celular" className="scroll-mt-24 bg-slate-950 px-6 py-20 text-white sm:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <FadeIn className="flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
            <div className="max-w-3xl">
              <p className="text-xs font-extrabold uppercase text-sky-400">Do cardápio ao painel</p>
              <h2 className="mt-4 text-3xl font-extrabold sm:text-5xl">Veja um pedido do começo ao fim</h2>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-400">Monte um pedido em um cardápio fictício e acompanhe o preparo no painel. Nas capturas abaixo, conheça as telas que você usará no seu restaurante.</p>
            </div>
            <a href="/demo" onClick={() => trackConversionEvent('view_demo_menu', { source: 'interactive_demo_cta' })} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              Fazer um pedido na demo <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </FadeIn>
          <div className="mt-12 grid gap-10 lg:grid-cols-[.76fr_1.24fr] lg:items-center">
            <div className="space-y-2" role="tablist" aria-label="Telas da Aladay">
              {DEMO_SCREENS.map((screen) => {
                const isActive = activeDemo.id === screen.id;
                return (
                  <button key={screen.id} type="button" role="tab" aria-selected={isActive} onClick={() => setActiveDemo(screen)} className={`w-full border-l-2 px-5 py-5 text-left transition ${isActive ? 'border-sky-400 bg-white/8' : 'border-white/10 hover:border-white/30 hover:bg-white/5'}`}>
                    <span className={`text-[11px] font-bold uppercase ${isActive ? 'text-sky-400' : 'text-slate-500'}`}>{screen.eyebrow}</span>
                    <span className="mt-1 block text-lg font-bold">{screen.label}</span>
                    <span className="mt-2 block text-sm leading-relaxed text-slate-400">{screen.description}</span>
                  </button>
                );
              })}
            </div>
            <div className="relative min-h-[500px] overflow-hidden rounded-lg border border-white/10 bg-[#0b1220] p-5 sm:min-h-[600px] sm:p-8">
              <div className="absolute inset-x-0 top-0 h-1 bg-blue-600" />
              <AnimatePresence mode="wait">
                <motion.div key={activeDemo.id} initial={reduceMotion ? undefined : { opacity: 0, y: 14 }} animate={reduceMotion ? undefined : { opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0, y: -10 }} className="flex min-h-[540px] items-center justify-center">
                  <div className={`overflow-hidden bg-white shadow-[0_30px_80px_rgba(0,0,0,.5)] ${activeDemo.id === 'management' ? 'w-full max-w-2xl border-[6px] border-slate-800' : 'h-[540px] w-[276px] rounded-[34px] border-[8px] border-slate-800'}`}>
                    <img src={activeDemo.image} alt={activeDemo.imageAlt} className={`h-full w-full ${activeDemo.id === 'management' ? 'object-contain' : 'object-cover object-top'}`} loading="lazy" decoding="async" />
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
          <div className="mt-14 border-t border-white/15 pt-8">
            <FadeIn className="flex items-end justify-between gap-6">
              <h3 className="text-xl font-bold">Mais telas da Aladay</h3>
              <div className="hidden gap-2 sm:flex">
                <button type="button" onClick={() => reelsRef.current?.scrollBy({ left: -320, behavior: reduceMotion ? 'auto' : 'smooth' })} aria-label="Ver prévias anteriores" className="flex h-11 w-11 items-center justify-center border border-slate-300 transition hover:bg-slate-950 hover:text-white"><ChevronLeft className="h-5 w-5" /></button>
                <button type="button" onClick={() => reelsRef.current?.scrollBy({ left: 320, behavior: reduceMotion ? 'auto' : 'smooth' })} aria-label="Ver próximas prévias" className="flex h-11 w-11 items-center justify-center border border-slate-300 transition hover:bg-slate-950 hover:text-white"><ChevronRight className="h-5 w-5" /></button>
              </div>
            </FadeIn>
            <div ref={reelsRef} className="mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4">
              {REELS.map((reel) => (
                <button key={reel.id} type="button" onClick={() => setActiveReel(reel)} className="group relative aspect-[4/3] w-[220px] shrink-0 snap-start overflow-hidden rounded-lg bg-slate-900 text-left sm:w-[245px]">
                  <img src={reel.poster} alt={reel.posterAlt} className="h-full w-full object-cover object-top opacity-80 transition duration-500 group-hover:scale-[1.03] group-hover:opacity-65" loading="lazy" decoding="async" />
                  <span className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent" />
                  {reel.videoSrc && <span className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-950 shadow-xl transition group-hover:scale-110"><Play className="ml-1 h-5 w-5 fill-current" /></span>}
                  <span className="absolute bottom-5 left-5 right-5 text-lg font-bold text-white">{reel.title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="planos" className="scroll-mt-24 bg-white px-6 py-20 sm:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <FadeIn className="mx-auto max-w-3xl text-center"><p className="text-xs font-extrabold uppercase text-blue-600">Planos reais, sem comissão</p><h2 className="mt-4 text-3xl font-extrabold sm:text-5xl">Uma assinatura. O controle continua seu.</h2><p className="mt-5 text-base leading-relaxed text-slate-600">Compare os planos ou comece com 15 dias de teste grátis sem cartão.</p></FadeIn>
          <div className="mx-auto mt-12 grid max-w-5xl gap-5 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200 bg-white p-7 sm:p-9">
              <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-extrabold uppercase text-slate-500">Plano Pro</p><h3 className="mt-2 text-2xl font-bold">Anual no cartão</h3></div><span className="bg-emerald-100 px-3 py-1 text-[10px] font-extrabold uppercase text-emerald-800">Economize R$ 370,80/ano</span></div>
              <div className="mt-8 border-y border-slate-200 py-6"><span className="text-4xl font-extrabold">R$ 99,00</span><span className="text-sm text-slate-500"> /mês</span><p className="mt-2 text-xs font-semibold text-slate-500">12 parcelas no cartão de crédito</p></div>
              <ul className="mt-7 space-y-3 text-sm text-slate-700">{['Cardápio, pedidos e produtos ilimitados', 'Painel, KDS e automações de WhatsApp', 'Pix direto na conta da loja', 'Controle de mesas, garçons e relatórios'].map((item) => <li key={item} className="flex items-start gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />{item}</li>)}</ul>
              <button type="button" onClick={() => { setPlanCycle('YEARLY'); handleSignup('pricing_yearly', 'YEARLY'); }} className="mt-8 flex min-h-12 w-full items-center justify-center gap-2 bg-slate-950 px-5 text-sm font-bold text-white transition hover:bg-blue-600">Escolher plano anual <ArrowRight className="h-4 w-4" /></button>
            </div>
            <div className="relative overflow-hidden rounded-lg border-2 border-blue-600 bg-slate-950 p-7 text-white sm:p-9">
              <span className="absolute right-0 top-0 bg-blue-600 px-3 py-2 text-[10px] font-extrabold uppercase">Teste grátis disponível</span>
              <p className="text-xs font-extrabold uppercase text-sky-400">Plano Pro</p><h3 className="mt-2 text-2xl font-bold">Mensal</h3>
              <div className="mt-8 border-y border-white/15 py-6"><span className="text-4xl font-extrabold">R$ 129,90</span><span className="text-sm text-slate-400"> /mês</span><p className="mt-2 text-xs font-semibold text-sky-400">15 dias grátis sem cartão. Escolha um plano ao fim do teste.</p></div>
              <ul className="mt-7 space-y-3 text-sm text-slate-300">{['Todos os recursos do Plano Pro', '15 dias para experimentar a plataforma', 'Sem fidelidade: cancele quando quiser', 'Pix, cartão de crédito ou boleto'].map((item) => <li key={item} className="flex items-start gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />{item}</li>)}</ul>
              <button type="button" onClick={() => { setPlanCycle('MONTHLY'); handleSignup('pricing_monthly', 'MONTHLY'); }} className="mt-8 flex min-h-12 w-full items-center justify-center gap-2 bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-500">Começar 15 dias grátis <ArrowRight className="h-4 w-4" /></button>
            </div>
          </div>
          <p className="mt-7 text-center text-sm text-slate-600">
            <a href="#calculadora" className="font-semibold text-blue-700 underline underline-offset-4">Calcular minha economia</a>
          </p>
        </div>
      </section>

      <section id="calculadora" className="scroll-mt-24 border-y border-slate-200 bg-[#f5f7fa] px-6 py-20 sm:px-10 lg:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_.85fr] lg:items-center">
          <FadeIn>
            <p className="text-xs font-extrabold uppercase text-blue-600">Calculadora de margem</p><h2 className="mt-4 text-3xl font-extrabold sm:text-4xl">Quanto uma operação direta pode preservar?</h2><p className="mt-4 text-sm leading-relaxed text-slate-600">A estimativa compara a comissão informada com a assinatura da Aladay. O resultado varia conforme o seu volume real.</p>
            <div className="mt-8 space-y-7">
              <label htmlFor="orders" className="block"><span className="flex justify-between text-sm font-semibold"><span>Pedidos por mês</span><strong>{monthlyOrders}</strong></span><input id="orders" type="range" min="50" max="1500" step="50" value={monthlyOrders} onChange={(event) => setMonthlyOrders(Number(event.target.value))} className="mt-3 w-full accent-blue-600" /></label>
              <label htmlFor="ticket" className="block"><span className="flex justify-between text-sm font-semibold"><span>Ticket médio</span><strong>{formatBRL(averageTicket)}</strong></span><input id="ticket" type="range" min="25" max="180" step="1" value={averageTicket} aria-valuetext={formatBRL(averageTicket)} onChange={(event) => setAverageTicket(Number(event.target.value))} className="mt-3 w-full accent-blue-600" /></label>
              <label htmlFor="fee" className="block"><span className="flex justify-between text-sm font-semibold"><span>Comissão do marketplace</span><strong>{marketplaceFee}%</strong></span><input id="fee" type="range" min="12" max="27" step="1" value={marketplaceFee} onChange={(event) => setMarketplaceFee(Number(event.target.value))} className="mt-3 w-full accent-blue-600" /></label>
            </div>
          </FadeIn>
          <FadeIn className="rounded-lg bg-slate-950 p-8 text-white sm:p-10">
            <p className="text-xs font-extrabold uppercase text-sky-400">Estimativa mensal</p><p className="mt-5 text-sm text-slate-400">Valor potencialmente preservado depois da assinatura:</p><p className="mt-2 text-4xl font-extrabold sm:text-5xl">{formatBRL(monthlySavings)}</p><p className="mt-3 text-sm text-slate-400">ou {formatBRL(monthlySavings * 12)} em 12 meses</p>
            <div className="mt-7 grid grid-cols-2 gap-2 bg-white/5 p-1"><button type="button" onClick={() => setPlanCycle('YEARLY')} className={`px-3 py-2 text-xs font-bold ${planCycle === 'YEARLY' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>Anual · R$ 99</button><button type="button" onClick={() => setPlanCycle('MONTHLY')} className={`px-3 py-2 text-xs font-bold ${planCycle === 'MONTHLY' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>Mensal · R$ 129,90</button></div>
            <button type="button" onClick={() => handleSignup('calculator')} className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 bg-white px-5 text-sm font-bold text-slate-950 transition hover:bg-blue-600 hover:text-white">Testar a Aladay <ArrowRight className="h-4 w-4" /></button>
          </FadeIn>
        </div>
      </section>

      <section className="bg-white px-6 py-20 sm:px-10 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.7fr_1.3fr]">
          <FadeIn><p className="text-xs font-extrabold uppercase text-blue-600">Dúvidas frequentes</p><h2 className="mt-4 text-3xl font-extrabold sm:text-5xl">Antes de colocar o cardápio no ar.</h2><button type="button" onClick={openSupportWhatsApp} className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:text-blue-500">Falar com a equipe <MessageCircle className="h-4 w-4" /></button></FadeIn>
          <div className="border-t border-slate-200">
            {FAQS.map((item, index) => {
              const isOpen = openFaq === index;
              return (
                <div key={item.question} className="border-b border-slate-200">
                  <button type="button" onClick={() => setOpenFaq(isOpen ? null : index)} aria-expanded={isOpen} aria-controls={`faq-answer-${index}`} className="flex w-full items-center justify-between gap-6 py-6 text-left text-base font-bold sm:text-lg"><span>{item.question}</span><ChevronDown className={`h-5 w-5 shrink-0 text-blue-600 transition-transform ${isOpen ? 'rotate-180' : ''}`} /></button>
                  <AnimatePresence initial={false}>{isOpen && <motion.div id={`faq-answer-${index}`} initial={reduceMotion ? false : { height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={reduceMotion ? undefined : { height: 0, opacity: 0 }} className="overflow-hidden"><p className="max-w-3xl pb-6 text-sm leading-relaxed text-slate-600">{item.answer}</p></motion.div>}</AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="bg-slate-950 px-6 py-20 text-white sm:px-10 lg:py-28">
        <FadeIn className="mx-auto max-w-4xl text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center bg-blue-600"><Sparkles className="h-5 w-5" /></div><h2 className="mt-7 text-3xl font-extrabold sm:text-5xl">Pronto para modernizar seu restaurante?</h2><p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400">Crie seu cardápio, organize a operação e ofereça uma jornada mais simples para quem compra de você.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><button type="button" onClick={() => handleSignup('final_cta')} className="inline-flex min-h-12 items-center justify-center gap-2 bg-blue-600 px-7 text-sm font-bold text-white transition hover:bg-blue-500">Começar meu teste grátis <ArrowRight className="h-4 w-4" /></button><button type="button" onClick={authSession ? onNavigateToAdmin : onNavigateToLogin} className="inline-flex min-h-12 items-center justify-center border border-white/20 px-7 text-sm font-bold text-white transition hover:bg-white hover:text-slate-950">{authSession ? 'Ir para meu painel' : 'Já tenho uma conta'}</button></div>
        </FadeIn>
      </section>

      <footer className="border-t border-white/10 bg-slate-950 px-6 pb-10 text-slate-500 sm:px-10">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-5 border-t border-white/10 pt-8 text-xs sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 font-bold text-white"><span className="flex h-7 w-7 items-center justify-center bg-blue-600">A</span> Aladay</div>
          <div className="flex flex-wrap gap-5">{onNavigateToTerms && <button type="button" onClick={onNavigateToTerms} className="hover:text-white">Termos de Uso</button>}{onNavigateToPrivacy && <button type="button" onClick={onNavigateToPrivacy} className="hover:text-white">Política de Privacidade</button>}<button type="button" onClick={openSupportWhatsApp} className="hover:text-white">Atendimento</button></div>
          <span>© {new Date().getFullYear()} Aladay</span>
        </div>
      </footer>

      <dialog ref={reelDialog} onClose={() => setActiveReel(null)} aria-label={activeReel?.title} className="fixed inset-0 m-auto max-h-[92dvh] w-[min(92vw,29rem)] rounded-2xl bg-slate-950 p-4 text-white backdrop:bg-slate-950/85">
        {activeReel && <>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-base font-bold">{activeReel.title}</h2>
            <button type="button" onClick={() => reelDialog.current?.close()} aria-label="Fechar vídeo" className="aladay-action hover:bg-white/15"><X className="h-5 w-5" /></button>
          </div>
          {activeReel.videoSrc ? (
            <video src={activeReel.videoSrc} poster={activeReel.poster} controls muted playsInline preload="none" className="max-h-[70dvh] w-full rounded-xl bg-black" />
          ) : (
            <figure>
              <img src={activeReel.poster} alt={activeReel.posterAlt} className="mx-auto max-h-[62dvh] w-full rounded-xl object-contain" />
              <figcaption className="mt-3 text-sm text-slate-300">Captura do produto. O vídeo oficial ainda não está disponível.</figcaption>
            </figure>
          )}
        </>}
      </dialog>

      {cookieConsent === 'pending' && (
        <div className="fixed bottom-4 left-4 right-4 z-[70] rounded-lg border border-slate-300 bg-white p-5 text-xs shadow-2xl sm:left-auto sm:right-6 sm:max-w-md">
          <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" /><div><p className="font-bold text-slate-950">Privacidade e métricas</p><p className="mt-1 leading-relaxed text-slate-600">Usamos cookies essenciais e, com sua autorização, métricas anônimas para melhorar a experiência.</p></div></div>
          <div className="mt-4 flex gap-2"><button type="button" onClick={() => { setConsentStatus('granted'); setCookieConsent('granted'); initGA4(); }} className="flex-1 bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700">Aceitar métricas</button><button type="button" onClick={() => { setConsentStatus('denied'); setCookieConsent('denied'); }} className="px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100">Apenas essenciais</button></div>
        </div>
      )}
    </div>
  );
};

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  ArrowRight, BarChart3, Check, ChevronDown, ChevronLeft, ChevronRight,
  CirclePlay, ExternalLink, LayoutDashboard, MenuSquare, MessageCircle,
  Play, QrCode, ScanLine, ShieldCheck, Smartphone, Sparkles, Upload, X,
  Menu, ShoppingBag, Plus, Minus, Bot, Users, TrendingUp, Heart,
} from 'lucide-react';
import { AuthSession, RestaurantTenant } from '../types';
import {
  ConsentStatus, getConsentStatus, initGA4, setConsentStatus, trackConversionEvent,
} from '../utils/analytics';
import './landingV2.css';

interface LandingPageViewProps {
  tenant: RestaurantTenant;
  authSession: AuthSession | null;
  onNavigateToLogin: () => void;
  onNavigateToSetup: () => void;
  onNavigateToDemoMenu: () => void;
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
  duration: string;
  poster: string;
  posterAlt: string;
  videoSrc?: string;
}

const PRODUCT_CAPTURE = '/assets/landing/aladay-produtos.webp';
const CART_CAPTURE = '/assets/landing/aladay-carrinho.webp';
const ADMIN_CAPTURE = '/assets/landing/aladay-painel.webp';
const PHONE_CAPTURE = '/assets/landing/aladay-cardapio.webp';
const WHATSAPP_CAPTURE = '/assets/landing/aladay-whatsapp.webp';

const FEATURES = [
  { icon: Smartphone, title: 'Cardápio digital responsivo', description: 'Uma vitrine rápida e organizada para o cliente escolher pelo próprio celular.' },
  { icon: QrCode, title: 'Acesso por QR Code', description: 'Leve o cliente direto ao cardápio da loja, no salão, na embalagem ou no balcão.' },
  { icon: MessageCircle, title: 'Pedidos no WhatsApp', description: 'Centralize o contato e envie atualizações pelo canal que o cliente já usa.' },
  { icon: MenuSquare, title: 'Produtos e categorias', description: 'Organize preços, adicionais, fotos e disponibilidade em uma operação mais simples.' },
  { icon: LayoutDashboard, title: 'Painel e KDS', description: 'Acompanhe os pedidos em uma visão operacional clara para atendimento e cozinha.' },
  { icon: BarChart3, title: 'Gestão do restaurante', description: 'Consulte vendas, clientes, mesas e indicadores disponíveis na plataforma.' },
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
    image: ADMIN_CAPTURE, imageAlt: 'Captura real do painel de gestão Aladay',
  },
];

const REELS: Reel[] = [
  { id: 'digital-menu', title: 'O cardápio na mão do cliente', duration: '01', poster: PHONE_CAPTURE, posterAlt: 'Prévia vertical do cardápio digital Aladay' },
  { id: 'order-flow', title: 'Do produto ao carrinho', duration: '02', poster: PRODUCT_CAPTURE, posterAlt: 'Prévia vertical da seleção de produtos no Aladay' },
  { id: 'whatsapp', title: 'Atualizações pelo WhatsApp', duration: '03', poster: WHATSAPP_CAPTURE, posterAlt: 'Prévia vertical do atendimento pelo WhatsApp' },
  { id: 'restaurant-panel', title: 'A rotina no painel', duration: '04', poster: ADMIN_CAPTURE, posterAlt: 'Prévia vertical do painel do restaurante Aladay' },
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
    question: 'A Aladay funciona para delivery e retirada?',
    answer: 'Sim. O restaurante pode configurar jornadas de entrega e retirada conforme a própria operação.',
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
    answer: 'O plano mensal inclui 15 dias de teste gratuito. Nesse período, o restaurante pode experimentar os recursos antes da cobrança mensal de R$ 129,90.',
  },
  {
    question: 'Já posso usar todos os recursos Aladay AI?',
    answer: 'Os módulos de inteligência estão em evolução. Consulte a equipe sobre os recursos disponíveis para seu restaurante e as condições de ativação.',
  },
];

const HOW_IT_WORKS = [
  { number: '01', icon: Upload, title: 'Configure seu cardápio', description: 'Organize produtos e categorias e deixe o menu digital pronto para receber clientes.' },
  { number: '02', icon: ScanLine, title: 'Compartilhe seu QR Code', description: 'Divulgue no salão, nas redes sociais, no balcão e nas embalagens do restaurante.' },
  { number: '03', icon: MessageCircle, title: 'Receba e acompanhe pedidos', description: 'Centralize a operação no painel e mantenha o cliente informado pelo WhatsApp.' },
];

const SAMPLE_PRODUCTS = [
  { id: 'burger', category: 'Lanches', name: 'Hambúrguer especial', detail: 'Carne, queijo e molho da casa', price: 29.9, image: '/assets/landing-v2/burger.svg' },
  { id: 'pizza', category: 'Pizzas', name: 'Pizza artesanal', detail: 'Molho especial e muito sabor', price: 49.9, image: '/assets/landing-v2/pizza.svg' },
  { id: 'acai', category: 'Sobremesas', name: 'Açaí especial', detail: 'Frutas e complementos', price: 19.9, image: '/assets/landing-v2/acai.svg' },
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
  onNavigateToDemoMenu,
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sampleCategory, setSampleCategory] = useState('Todos');
  const [sampleCart, setSampleCart] = useState<Record<string, number>>({});
  const [sampleCartOpen, setSampleCartOpen] = useState(false);
  const [sampleMessage, setSampleMessage] = useState('');

  useEffect(() => {
    const status = getConsentStatus();
    setCookieConsent(status);
    if (status === 'granted') initGA4();
    trackConversionEvent('page_view', { page_name: 'landing_home_2_0', tenant_slug: tenant.slug });
  }, [tenant.slug]);

  useEffect(() => {
    if (!activeReel) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveReel(null);
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [activeReel]);

  const monthlySavings = useMemo(() => {
    const marketplaceCost = monthlyOrders * averageTicket * (marketplaceFee / 100);
    const aladayCost = planCycle === 'YEARLY' ? 99 : 129.9;
    return Math.max(0, marketplaceCost - aladayCost);
  }, [averageTicket, marketplaceFee, monthlyOrders, planCycle]);

  const formatBRL = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const sampleCount = Object.values(sampleCart).reduce((sum, count) => sum + count, 0);
  const sampleTotal = SAMPLE_PRODUCTS.reduce((sum, product) => sum + product.price * (sampleCart[product.id] || 0), 0);
  const changeSampleQuantity = (id: string, delta: number) => {
    setSampleCart((cart) => ({ ...cart, [id]: Math.max(0, (cart[id] || 0) + delta) }));
    setSampleMessage('');
  };

  const sendContactMessage = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    if (data.get('website')) return;
    const name = String(data.get('name') || '').trim();
    const restaurant = String(data.get('restaurant') || '').trim();
    const phone = String(data.get('phone') || '').trim();
    const segment = String(data.get('segment') || '').trim();
    trackConversionEvent('click_whatsapp_contact', { source: 'landing_v2_form' });
    const message = encodeURIComponent(`Olá! Sou ${name}, do restaurante ${restaurant} (${segment}). Meu WhatsApp é ${phone}. Quero conhecer a Aladay.`);
    window.open(`https://wa.me/559131976334?text=${message}`, '_blank', 'noopener,noreferrer');
  };

  const handleSignup = (source: string, cycle = planCycle) => {
    trackConversionEvent('click_signup', {
      source,
      plan: cycle === 'YEARLY' ? 'pro_99_yearly' : 'pro_129_90',
    });
    onNavigateToSetup();
  };

  const handleDemo = (source: string) => {
    trackConversionEvent('view_demo_menu', { source });
    document.getElementById('demonstracao-celular')?.scrollIntoView({
      behavior: reduceMotion ? 'auto' : 'smooth',
    });
  };

  const openSupportWhatsApp = () => {
    trackConversionEvent('click_whatsapp_contact', { source: 'landing_v2' });
    const message = encodeURIComponent('Olá! Gostaria de conhecer a Aladay para digitalizar o meu restaurante.');
    window.open(`https://wa.me/559131976334?text=${message}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="aladay-landing aladay-v2 overflow-hidden bg-[#f6f9fd] text-[#0b274a]">
      <a href="#conteudo-aladay" className="v2-skip">Pular para o conteúdo</a>
      <header className="v2-header" id="topo">
        <div className="v2-nav-shell">
          <a className="v2-logo" href="#topo" aria-label="Aladay, voltar ao início"><span className="v2-logo-mark">A</span><span>ala<span>day</span></span></a>
          <nav className="v2-desktop-nav" aria-label="Navegação principal">
            <a href="#recursos">Recursos</a><a href="#como-funciona">Como funciona</a><a href="#aladay-ai">Aladay AI</a><a href="#planos">Planos</a><a href="#duvidas">Dúvidas</a>
          </nav>
          <div className="v2-header-actions">
            <button type="button" onClick={authSession ? onNavigateToAdmin : onNavigateToLogin}>{authSession ? 'Meu painel' : 'Entrar'}</button>
            <button type="button" className="v2-primary" onClick={() => handleSignup('header')}>Começar grátis <ArrowRight size={16} /></button>
          </div>
          <button type="button" className="v2-mobile-toggle" onClick={() => setMobileNavOpen(!mobileNavOpen)} aria-label={mobileNavOpen ? 'Fechar menu' : 'Abrir menu'} aria-controls="v2-mobile-menu" aria-expanded={mobileNavOpen}>{mobileNavOpen ? <X size={23} /> : <Menu size={23} />}</button>
        </div>
        {mobileNavOpen && <nav id="v2-mobile-menu" className="v2-mobile-nav" aria-label="Navegação móvel">
          {[['Recursos', '#recursos'], ['Como funciona', '#como-funciona'], ['Aladay AI', '#aladay-ai'], ['Planos', '#planos'], ['Dúvidas', '#duvidas']].map(([label, href]) => <a key={href} href={href} onClick={() => setMobileNavOpen(false)}>{label}</a>)}
          <button type="button" onClick={authSession ? onNavigateToAdmin : onNavigateToLogin}>{authSession ? 'Meu painel' : 'Entrar'}</button>
          <button type="button" className="v2-primary" onClick={() => handleSignup('mobile_header')}>Começar grátis <ArrowRight size={16} /></button>
        </nav>}
      </header>

      <main id="conteudo-aladay">
      <section className="v2-hero">
        <div className="v2-hero-grid">
          <div className="v2-hero-copy">
            <span className="v2-eyebrow"><Sparkles size={15} /> Tecnologia que trabalha com o seu restaurante</span>
            <h1>Mais pedidos. <span>Menos correria.</span> Tudo em um lugar.</h1>
            <p>Cardápio digital, QR Code, pedidos pelo WhatsApp e uma operação mais organizada. A Aladay conecta seu restaurante aos clientes sem complicar sua rotina.</p>
            <div className="v2-hero-actions"><button type="button" className="v2-primary" onClick={() => handleSignup('hero_primary')}>Começar 15 dias grátis <ArrowRight size={17} /></button><button type="button" className="v2-secondary" onClick={() => handleDemo('hero_secondary')}><CirclePlay size={17} /> Ver como funciona</button></div>
            <div className="v2-benefits"><span><Check size={16} /> 15 dias grátis no mensal</span><span><Check size={16} /> 0% de comissão</span><span><Check size={16} /> Sem instalar aplicativo</span></div>
          </div>
          <div className="v2-hero-visual" aria-label="Prévia do painel e do cardápio Aladay">
            <div className="v2-dashboard"><div className="v2-dashboard-bar"><span className="v2-dashboard-dot" /><span className="v2-dashboard-dot" /><span className="v2-dashboard-dot" /><b>Painel Aladay</b></div><img src={ADMIN_CAPTURE} alt="Captura do painel de gestão Aladay" /></div>
            <div className="v2-phone"><img src={PHONE_CAPTURE} alt="Captura do cardápio digital Aladay" /></div>
            <div className="v2-notice"><span><MessageCircle size={18} /></span><div><strong>Pedido atualizado</strong><small>Acompanhamento no WhatsApp</small></div></div>
            <p className="v2-visual-caption">Capturas reais da plataforma Aladay</p>
          </div>
        </div>
      </section>

      <section className="v2-segments" aria-label="Para diferentes tipos de negócio"><div className="v2-segments-inner"><strong>Feito para quem serve bem</strong><span>🍔 Hamburguerias</span><span>🍕 Pizzarias</span><span>🍽️ Restaurantes</span><span>🛵 Delivery</span><span>☕ Cafeterias</span></div></section>

      <section aria-label="Diferenciais comerciais" className="border-b border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-slate-200 px-6 sm:grid-cols-4 sm:px-10 lg:px-12">
          {[
            ['0%', 'comissão nas vendas diretas'],
            ['15 dias', 'de teste no plano mensal'],
            ['R$ 99', 'por mês no plano anual'],
            ['24/7', 'cardápio disponível online'],
          ].map(([value, label]) => (
            <div key={value} className="px-4 py-7 text-center"><p className="text-2xl font-extrabold">{value}</p><p className="mt-1 text-[11px] font-semibold text-slate-500">{label}</p></div>
          ))}
        </div>
      </section>

      <section id="recursos" className="scroll-mt-24 px-6 py-20 sm:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <FadeIn className="max-w-3xl">
            <p className="text-xs font-extrabold uppercase text-blue-600">Da vitrine à cozinha</p>
            <h2 className="mt-4 text-3xl font-extrabold leading-tight sm:text-5xl">Tudo que seu restaurante precisa para começar a vender digitalmente.</h2>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-600">Uma jornada conectada para apresentar produtos, receber pedidos e organizar a rotina sem tirar do restaurante o controle da própria operação.</p>
          </FadeIn>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, index) => (
              <FadeIn key={feature.title} className="group min-h-56 rounded-lg border border-slate-200 bg-white p-7 transition-colors hover:bg-slate-50">
                <div className="flex h-11 w-11 items-center justify-center bg-slate-950 text-white transition-colors group-hover:bg-blue-600"><feature.icon className="h-5 w-5" /></div>
                <p className="mt-7 text-[11px] font-bold text-blue-600">0{index + 1}</p>
                <h3 className="mt-2 text-lg font-bold">{feature.title}</h3>
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
              <p className="text-xs font-extrabold uppercase text-sky-400">Produto real, em contexto</p>
              <h2 className="mt-4 text-3xl font-extrabold sm:text-5xl">Veja a Aladay em ação.</h2>
              <p className="mt-5 max-w-2xl text-base leading-relaxed text-slate-400">Explore capturas reais do cardápio e do painel. Cada tela abaixo vem do produto atual, sem promessas ilustrativas.</p>
            </div>
            <button type="button" onClick={onNavigateToDemoMenu} className="inline-flex min-h-11 items-center justify-center gap-2 border border-white/20 px-5 py-3 text-sm font-bold transition hover:bg-white hover:text-slate-950">
              Abrir demonstração interativa <ExternalLink className="h-4 w-4" />
            </button>
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
        </div>
      </section>

      <section id="demonstracao" className="scroll-mt-24 bg-white px-6 py-20 sm:px-10 lg:py-24">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-2 lg:items-center">
          <div><p className="text-xs font-extrabold uppercase text-blue-600">Experimente na prática</p><h2 className="mt-4 text-3xl font-extrabold sm:text-5xl">Uma experiência boa começa no primeiro toque.</h2><p className="mt-5 max-w-lg text-sm leading-7 text-slate-600">Teste o cardápio ilustrativo: filtre produtos, adicione itens e confira o total. Nenhum pedido real é criado nesta simulação.</p><ul className="mt-7 space-y-3 text-sm text-slate-700">{['Visual que valoriza seus produtos', 'Navegação rápida em qualquer tela', 'Carrinho fácil de usar'].map((item) => <li key={item} className="flex items-center gap-2"><Check size={17} className="text-teal-500" /> {item}</li>)}</ul><button type="button" onClick={onNavigateToDemoMenu} className="mt-8 inline-flex items-center gap-2 font-bold text-blue-700 hover:text-blue-500">Abrir cardápio real de demonstração <ExternalLink size={16} /></button></div>
          <div className="v2-demo-shell"><div className="v2-demo-card"><div className="v2-demo-head"><span>🍴</span><div><strong>Sabor da Casa</strong><small>Uma demonstração Aladay</small></div><span>Demo</span></div><div className="v2-demo-banner"><small>ESCOLHA O QUE DÁ VONTADE</small><strong>O sabor que combina com você.</strong></div><div className="v2-demo-tabs" role="group" aria-label="Filtrar produtos">{['Todos', 'Lanches', 'Pizzas', 'Sobremesas'].map((category) => <button key={category} type="button" className={sampleCategory === category ? 'active' : ''} aria-pressed={sampleCategory === category} onClick={() => setSampleCategory(category)}>{category}</button>)}</div><div className="v2-demo-products">{SAMPLE_PRODUCTS.filter((product) => sampleCategory === 'Todos' || sampleCategory === product.category).map((product) => <div className="v2-demo-product" key={product.id}><img src={product.image} alt={`Ilustração de ${product.name.toLowerCase()}`} loading="lazy" /><div><strong>{product.name}</strong><small>{product.detail}</small><b>{formatBRL(product.price)}</b></div><button type="button" aria-label={`Adicionar ${product.name} ao carrinho`} onClick={() => changeSampleQuantity(product.id, 1)}><Plus size={18} /></button></div>)}</div><div className="v2-demo-cart"><button type="button" className="v2-demo-cart-toggle" aria-expanded={sampleCartOpen} aria-controls="v2-cart-details" onClick={() => setSampleCartOpen(!sampleCartOpen)}><ShoppingBag size={17} /> Ver meu pedido <span>{sampleCount}</span><strong>{formatBRL(sampleTotal)}</strong><ChevronDown size={17} /></button>{sampleCartOpen && <div id="v2-cart-details" className="v2-cart-details">{sampleCount === 0 ? <p>Seu carrinho está vazio.</p> : SAMPLE_PRODUCTS.filter((product) => sampleCart[product.id] > 0).map((product) => <div key={product.id} className="v2-cart-line"><span>{product.name}</span><strong>{formatBRL(product.price * sampleCart[product.id])}</strong><div><button type="button" aria-label={`Remover um ${product.name}`} onClick={() => changeSampleQuantity(product.id, -1)}><Minus size={13} /></button><b>{sampleCart[product.id]}</b><button type="button" aria-label={`Adicionar um ${product.name}`} onClick={() => changeSampleQuantity(product.id, 1)}><Plus size={13} /></button></div></div>)}<div className="v2-cart-actions"><button type="button" onClick={() => { setSampleCart({}); setSampleMessage(''); }}>Limpar carrinho</button><button type="button" disabled={!sampleCount} onClick={() => setSampleMessage('Simulação concluída. Nenhum pedido foi enviado.')}>Simular finalização <ArrowRight size={14} /></button></div>{sampleMessage && <p role="status">{sampleMessage}</p>}</div>}</div></div></div>
        </div>
      </section>

      <section className="bg-white px-6 py-20 sm:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <FadeIn className="flex items-end justify-between gap-6">
            <div className="max-w-2xl"><p className="text-xs font-extrabold uppercase text-blue-600">Demonstrações rápidas</p><h2 className="mt-4 text-3xl font-extrabold sm:text-5xl">Veja como é simples usar a Aladay.</h2></div>
            <div className="hidden gap-2 sm:flex">
              <button type="button" onClick={() => reelsRef.current?.scrollBy({ left: -320, behavior: reduceMotion ? 'auto' : 'smooth' })} aria-label="Ver vídeos anteriores" className="flex h-11 w-11 items-center justify-center border border-slate-300 transition hover:bg-slate-950 hover:text-white"><ChevronLeft className="h-5 w-5" /></button>
              <button type="button" onClick={() => reelsRef.current?.scrollBy({ left: 320, behavior: reduceMotion ? 'auto' : 'smooth' })} aria-label="Ver próximos vídeos" className="flex h-11 w-11 items-center justify-center border border-slate-300 transition hover:bg-slate-950 hover:text-white"><ChevronRight className="h-5 w-5" /></button>
            </div>
          </FadeIn>
          <div ref={reelsRef} className="mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto pb-4">
            {REELS.map((reel) => (
              <button key={reel.id} type="button" onClick={() => setActiveReel(reel)} className="group relative aspect-[9/16] w-[250px] shrink-0 snap-start overflow-hidden rounded-lg bg-slate-900 text-left sm:w-[280px]">
                <img src={reel.poster} alt={reel.posterAlt} className="h-full w-full object-cover object-top opacity-80 transition duration-500 group-hover:scale-[1.03] group-hover:opacity-65" loading="lazy" decoding="async" />
                <span className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent" />
                <span className="absolute left-4 top-4 border border-white/30 bg-black/45 px-2 py-1 text-[10px] font-bold text-white backdrop-blur">EP. {reel.duration}</span>
                <span className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-slate-950 shadow-xl transition group-hover:scale-110"><Play className="ml-1 h-5 w-5 fill-current" /></span>
                <span className="absolute bottom-5 left-5 right-5 text-lg font-bold text-white">{reel.title}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section id="como-funciona" className="scroll-mt-24 border-y border-slate-200 bg-[#f5f7fa] px-6 py-20 sm:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <FadeIn className="text-center"><p className="text-xs font-extrabold uppercase text-blue-600">Comece em três movimentos</p><h2 className="mx-auto mt-4 max-w-3xl text-3xl font-extrabold sm:text-5xl">Do primeiro cadastro ao primeiro pedido.</h2></FadeIn>
          <div className="relative mt-14 grid gap-8 lg:grid-cols-3">
            <div className="absolute left-[17%] right-[17%] top-10 hidden h-px bg-slate-300 lg:block" />
            {HOW_IT_WORKS.map((step) => (
              <FadeIn key={step.number} className="relative bg-[#f5f7fa] text-center">
                <div className="relative z-10 mx-auto flex h-20 w-20 items-center justify-center border border-slate-300 bg-white text-blue-600 shadow-sm"><step.icon className="h-7 w-7" /></div>
                <p className="mt-6 text-[11px] font-extrabold text-blue-600">ETAPA {step.number}</p><h3 className="mt-2 text-xl font-bold">{step.title}</h3><p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-slate-600">{step.description}</p>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      <section id="aladay-ai" className="v2-ai-section scroll-mt-24 px-6 py-20 sm:px-10 lg:py-24">
        <div className="v2-ai-shell mx-auto grid max-w-7xl gap-10 p-8 sm:p-12 lg:grid-cols-2 lg:items-center lg:p-16">
          <div><span className="v2-ai-badge"><Sparkles size={15} /> ALADAY AI · EM EVOLUÇÃO</span><h2 className="mt-6 text-3xl font-extrabold leading-tight sm:text-5xl">O futuro do atendimento já tem <span>nome.</span></h2><p className="mt-5 max-w-xl text-sm leading-7 text-blue-100">A Aladay desenvolve recursos de inteligência para ajudar no atendimento, organizar conversas e apoiar decisões do restaurante. Disponibilidade e configuração variam conforme o módulo.</p><div className="mt-6 grid gap-3 text-sm text-blue-100"><span className="flex gap-2"><Check size={17} /> Atendimento personalizado por estabelecimento</span><span className="flex gap-2"><Check size={17} /> Integração planejada com cardápio e WhatsApp</span><span className="flex gap-2"><Check size={17} /> Transferência para atendimento humano quando disponível</span></div><button type="button" onClick={openSupportWhatsApp} className="v2-ai-button mt-8">Conhecer os recursos <ArrowRight size={16} /></button></div>
          <div className="v2-ai-chat" aria-label="Exemplo ilustrativo de conversa com assistente"><div className="v2-ai-chat-head"><span>✳</span><div><strong>Alay</strong><small>Exemplo de conversa · assistente Aladay</small></div></div><div className="v2-ai-chat-body"><p>Olá! 👋 Quer conhecer nosso cardápio ou fazer um pedido?</p><p>Quero ver as opções de almoço 🍽️</p><p>Perfeito! Posso te mostrar as opções disponíveis no cardápio.</p><div><span>Ver cardápio</span><span>Falar com atendente</span></div></div><div className="v2-ai-chat-foot">Escreva uma mensagem... <ArrowRight size={16} /></div></div>
        </div>
      </section>

      <section className="px-6 py-20 sm:px-10 lg:py-24"><div className="mx-auto max-w-7xl"><p className="text-xs font-extrabold uppercase text-blue-600">Mais ferramentas para crescer</p><h2 className="mt-4 max-w-3xl text-3xl font-extrabold sm:text-5xl">Da primeira venda ao próximo cliente.</h2><p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600">Além do cardápio, a plataforma reúne recursos de gestão e relacionamento. A disponibilidade depende do plano e da configuração do restaurante.</p><div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[
        { icon: Users, title: 'CRM e clientes', description: 'Conheça a base de clientes e organize o relacionamento.' },
        { icon: TrendingUp, title: 'Analytics e upsell', description: 'Acompanhe indicadores e oportunidades de venda adicional.' },
        { icon: Heart, title: 'Feedback', description: 'Receba avaliações e melhore a experiência de quem compra.' },
        { icon: Bot, title: 'Intelligence', description: 'Explore recursos inteligentes disponíveis para a operação.' },
      ].map(({ icon: Icon, title, description }) => <div key={title} className="rounded-lg border border-slate-200 bg-white p-6"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700"><Icon size={22} /></span><h3 className="mt-5 text-lg font-bold">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p></div>)}</div></div></section>

      <section className="px-6 py-20 sm:px-10 lg:py-24">
        <FadeIn className="relative mx-auto grid max-w-7xl overflow-hidden rounded-lg bg-blue-600 text-white lg:grid-cols-[1fr_.72fr]">
          <div className="relative z-10 p-8 sm:p-12 lg:p-16">
            <p className="text-xs font-extrabold uppercase text-blue-100">Seu canal próprio de vendas</p>
            <h2 className="mt-4 max-w-2xl text-3xl font-extrabold sm:text-5xl">Seu restaurante merece uma experiência digital melhor.</h2>
            <p className="mt-5 text-base text-blue-100">Comece a modernizar seu atendimento com a Aladay.</p>
            <button type="button" onClick={() => handleSignup('promotional_banner')} className="mt-8 inline-flex min-h-12 items-center gap-2 bg-white px-6 py-3 text-sm font-bold text-blue-700 transition hover:bg-slate-950 hover:text-white">Experimentar gratuitamente <ArrowRight className="h-4 w-4" /></button>
          </div>
          <div className="relative min-h-72 overflow-hidden bg-slate-950">
            <img src={PHONE_CAPTURE} alt="Cardápio Aladay em um smartphone" className="absolute left-1/2 top-8 h-[500px] w-[255px] -translate-x-1/2 rotate-[3deg] rounded-[30px] border-[7px] border-slate-900 object-cover object-top shadow-2xl" loading="lazy" decoding="async" />
          </div>
        </FadeIn>
      </section>

      <section id="planos" className="scroll-mt-24 bg-white px-6 py-20 sm:px-10 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <FadeIn className="mx-auto max-w-3xl text-center"><p className="text-xs font-extrabold uppercase text-blue-600">Planos reais, sem comissão</p><h2 className="mt-4 text-3xl font-extrabold sm:text-5xl">Uma assinatura. O controle continua seu.</h2><p className="mt-5 text-base leading-relaxed text-slate-600">Escolha entre economia anual no cartão ou a flexibilidade do plano mensal com 15 dias grátis.</p></FadeIn>
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
              <div className="mt-8 border-y border-white/15 py-6"><span className="text-4xl font-extrabold">R$ 129,90</span><span className="text-sm text-slate-400"> /mês</span><p className="mt-2 text-xs font-semibold text-sky-400">R$ 0 hoje. Cobrança após 15 dias.</p></div>
              <ul className="mt-7 space-y-3 text-sm text-slate-300">{['Todos os recursos do Plano Pro', '15 dias para experimentar a plataforma', 'Sem fidelidade: cancele quando quiser', 'Pix, cartão de crédito ou boleto'].map((item) => <li key={item} className="flex items-start gap-3"><Check className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />{item}</li>)}</ul>
              <button type="button" onClick={() => { setPlanCycle('MONTHLY'); handleSignup('pricing_monthly', 'MONTHLY'); }} className="mt-8 flex min-h-12 w-full items-center justify-center gap-2 bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-500">Começar 15 dias grátis <ArrowRight className="h-4 w-4" /></button>
            </div>
          </div>
        </div>
      </section>

      <section id="calculadora" className="scroll-mt-24 border-y border-slate-200 bg-[#f5f7fa] px-6 py-20 sm:px-10 lg:py-24">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[1fr_.85fr] lg:items-center">
          <FadeIn>
            <p className="text-xs font-extrabold uppercase text-blue-600">Calculadora de margem</p><h2 className="mt-4 text-3xl font-extrabold sm:text-4xl">Quanto uma operação direta pode preservar?</h2><p className="mt-4 text-sm leading-relaxed text-slate-600">A estimativa compara a comissão informada com a assinatura da Aladay. O resultado varia conforme o seu volume real.</p>
            <div className="mt-8 space-y-7">
              <label htmlFor="orders" className="block"><span className="flex justify-between text-sm font-semibold"><span>Pedidos por mês</span><strong>{monthlyOrders}</strong></span><input id="orders" type="range" min="50" max="1500" step="50" value={monthlyOrders} onChange={(event) => setMonthlyOrders(Number(event.target.value))} className="mt-3 w-full accent-blue-600" /></label>
              <label htmlFor="ticket" className="block"><span className="flex justify-between text-sm font-semibold"><span>Ticket médio</span><strong>{formatBRL(averageTicket)}</strong></span><input id="ticket" type="range" min="25" max="180" step="5" value={averageTicket} onChange={(event) => setAverageTicket(Number(event.target.value))} className="mt-3 w-full accent-blue-600" /></label>
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

      <section id="duvidas" className="scroll-mt-24 bg-white px-6 py-20 sm:px-10 lg:py-28">
        <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[.7fr_1.3fr]">
          <FadeIn><p className="text-xs font-extrabold uppercase text-blue-600">Dúvidas frequentes</p><h2 className="mt-4 text-3xl font-extrabold sm:text-5xl">Antes de colocar o cardápio no ar.</h2><button type="button" onClick={openSupportWhatsApp} className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-blue-700 hover:text-blue-500">Falar com a equipe <MessageCircle className="h-4 w-4" /></button></FadeIn>
          <div className="border-t border-slate-200">
            {FAQS.map((item, index) => {
              const isOpen = openFaq === index;
              return (
                <div key={item.question} className="border-b border-slate-200">
                  <button type="button" onClick={() => setOpenFaq(isOpen ? null : index)} aria-expanded={isOpen} aria-controls={`faq-answer-${index}`} className="flex w-full items-center justify-between gap-6 py-6 text-left text-base font-bold sm:text-lg"><span>{item.question}</span><ChevronDown className={`h-5 w-5 shrink-0 text-blue-600 transition-transform ${isOpen ? 'rotate-180' : ''}`} /></button>
                  <AnimatePresence initial={false}>{isOpen && <motion.div id={`faq-answer-${index}`} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden"><p className="max-w-3xl pb-6 text-sm leading-relaxed text-slate-600">{item.answer}</p></motion.div>}</AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section id="contato" className="scroll-mt-24 bg-white px-6 py-16 sm:px-10 lg:py-24"><div className="v2-contact-shell mx-auto grid max-w-7xl gap-10 p-7 text-white sm:p-12 lg:grid-cols-2 lg:gap-16 lg:p-16"><div><span className="v2-ai-badge">✳ SEU PRÓXIMO PASSO COMEÇA AQUI</span><h2 className="mt-7 text-3xl font-extrabold leading-tight sm:text-5xl">Seu restaurante pode ir <span className="text-cyan-300">muito mais longe.</span></h2><p className="mt-5 max-w-lg text-sm leading-7 text-blue-100">Conte um pouco sobre sua operação e inicie uma conversa com a equipe Aladay pelo WhatsApp.</p><div className="mt-10 space-y-5 text-sm"><p className="flex items-center gap-3"><ShieldCheck size={20} className="text-cyan-300" /> Seus dados vão apenas na mensagem que você escolher enviar.</p><p className="flex items-center gap-3"><MessageCircle size={20} className="text-cyan-300" /> Atendimento humano para conhecer os planos.</p></div></div><form className="v2-contact-form" onSubmit={sendContactMessage}><p className="text-xs font-extrabold uppercase tracking-wide text-blue-600">Vamos conversar?</p><h3 className="mt-2 text-xl font-bold">Conhecer a Aladay é o primeiro passo.</h3><div className="mt-6 grid gap-4 sm:grid-cols-2"><label>Seu nome<input name="name" type="text" minLength={2} maxLength={100} autoComplete="name" placeholder="Como podemos te chamar?" required /></label><label>Nome do restaurante<input name="restaurant" type="text" minLength={2} maxLength={120} autoComplete="organization" placeholder="Nome do seu negócio" required /></label></div><label className="mt-4">Seu WhatsApp<input name="phone" type="tel" inputMode="tel" minLength={10} maxLength={20} autoComplete="tel" placeholder="(91) 99999-9999" required /></label><label className="mt-4">Tipo de negócio<select name="segment" required defaultValue=""><option value="" disabled>Selecione uma opção</option>{['Restaurante', 'Hamburgueria', 'Pizzaria', 'Delivery', 'Cafeteria', 'Outro'].map((segment) => <option key={segment}>{segment}</option>)}</select></label><label className="v2-honeypot" aria-hidden="true">Não preencher<input name="website" type="text" tabIndex={-1} autoComplete="off" /></label><p className="mt-5 text-xs leading-5 text-slate-500">Ao continuar, o WhatsApp abre com uma mensagem preenchida. Você decide se deseja enviá-la.</p><button type="submit" className="v2-primary mt-5 w-full justify-center">Conversar pelo WhatsApp <ArrowRight size={16} /></button><button type="button" onClick={() => handleSignup('contact_form')} className="mt-4 w-full text-center text-sm font-bold text-blue-700">Prefiro começar meu teste grátis</button></form></div></section>

      <section className="bg-slate-950 px-6 py-20 text-white sm:px-10 lg:py-28">
        <FadeIn className="mx-auto max-w-4xl text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center bg-blue-600"><Sparkles className="h-5 w-5" /></div><h2 className="mt-7 text-3xl font-extrabold sm:text-5xl">Pronto para modernizar seu restaurante?</h2><p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400">Crie seu cardápio, organize a operação e ofereça uma jornada mais simples para quem compra de você.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row"><button type="button" onClick={() => handleSignup('final_cta')} className="inline-flex min-h-12 items-center justify-center gap-2 bg-blue-600 px-7 text-sm font-bold text-white transition hover:bg-blue-500">Começar meu teste grátis <ArrowRight className="h-4 w-4" /></button><button type="button" onClick={authSession ? onNavigateToAdmin : onNavigateToLogin} className="inline-flex min-h-12 items-center justify-center border border-white/20 px-7 text-sm font-bold text-white transition hover:bg-white hover:text-slate-950">{authSession ? 'Ir para meu painel' : 'Já tenho uma conta'}</button></div>
        </FadeIn>
      </section>
      </main>

      <footer className="border-t border-white/10 bg-slate-950 px-6 pb-10 text-slate-500 sm:px-10">
        <div className="mx-auto flex max-w-7xl flex-col justify-between gap-5 border-t border-white/10 pt-8 text-xs sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 font-bold text-white"><span className="flex h-7 w-7 items-center justify-center bg-blue-600">A</span> Aladay</div>
          <div className="flex flex-wrap gap-5">{onNavigateToTerms && <button type="button" onClick={onNavigateToTerms} className="hover:text-white">Termos de Uso</button>}{onNavigateToPrivacy && <button type="button" onClick={onNavigateToPrivacy} className="hover:text-white">Política de Privacidade</button>}<button type="button" onClick={openSupportWhatsApp} className="hover:text-white">Atendimento</button></div>
          <span>© {new Date().getFullYear()} Aladay</span>
        </div>
      </footer>

      <AnimatePresence>
        {activeReel && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label={activeReel.title} className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/95 p-4 backdrop-blur-md" onClick={() => setActiveReel(null)}>
            <button type="button" onClick={() => setActiveReel(null)} aria-label="Fechar vídeo" className="absolute right-5 top-5 flex h-11 w-11 items-center justify-center border border-white/20 text-white hover:bg-white hover:text-slate-950"><X className="h-5 w-5" /></button>
            <div className="relative aspect-[9/16] h-[80vh] max-h-[760px] overflow-hidden rounded-lg bg-black shadow-2xl" onClick={(event) => event.stopPropagation()}>
              {activeReel.videoSrc ? <video src={activeReel.videoSrc} poster={activeReel.poster} controls playsInline preload="metadata" className="h-full w-full object-cover" /> : (
                <div className="relative h-full w-full"><img src={activeReel.poster} alt={activeReel.posterAlt} className="h-full w-full object-cover object-top opacity-75" /><div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/20" /><div className="absolute inset-x-6 bottom-8 text-white"><p className="text-[10px] font-bold uppercase text-sky-400">Demonstração visual</p><h3 className="mt-2 text-2xl font-bold">{activeReel.title}</h3><p className="mt-3 text-sm leading-relaxed text-slate-300">A estrutura aceita arquivos MP4 e WebM. Enquanto o vídeo oficial não é publicado, esta captura real preserva a fidelidade ao produto.</p></div></div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {cookieConsent === 'pending' && (
        <div className="fixed bottom-4 left-4 right-4 z-[70] rounded-lg border border-slate-300 bg-white p-5 text-xs shadow-2xl sm:left-auto sm:right-6 sm:max-w-md">
          <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" /><div><p className="font-bold text-slate-950">Privacidade e métricas</p><p className="mt-1 leading-relaxed text-slate-600">Usamos cookies essenciais e, com sua autorização, métricas anônimas para melhorar a experiência.</p></div></div>
          <div className="mt-4 flex gap-2"><button type="button" onClick={() => { setConsentStatus('granted'); setCookieConsent('granted'); initGA4(); }} className="flex-1 bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700">Aceitar métricas</button><button type="button" onClick={() => { setConsentStatus('denied'); setCookieConsent('denied'); }} className="px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100">Apenas essenciais</button></div>
        </div>
      )}
    </div>
  );
};

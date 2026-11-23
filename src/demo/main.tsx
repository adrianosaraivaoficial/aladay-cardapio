import { SearchInput } from '../components/SearchInput';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowRight, ChefHat, LayoutDashboard, RotateCcw, ShoppingBag, Utensils } from 'lucide-react';
import '../index.css';
import './demo.css';
import { catalog, priceWithOptions, type DemoProduct } from './catalog';
import { createOrder, emptySession, maxQuantity, nextStatus, paymentMethods, statusLabel, totalOf, type DemoCartItem, type DemoOrder, type PaymentMethod } from './orders';
import { mutateSession, useDemoSession } from './session';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const date = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short',
});
const formatPrice = (cents: number) => money.format(cents / 100);
const products = new Map(catalog.map(product => [product.id, product]));
const categories = ['Todos', ...new Set(catalog.map(product => product.category))];
const menuPath = '/demo/cardapio';
const panelPath = '/demo/painel';
const guideSteps = ['Conheça o cardápio digital', 'Monte seu pedido', 'Simule o checkout', 'Veja o pedido recebido', 'Conheça os recursos de gestão'];

function DemoGuide({ step }: { step: number }) {
  return <ol className="demo-guide" aria-label="Etapas da demonstração">
    {guideSteps.map((label, index) => <li key={label} aria-current={index + 1 === step ? 'step' : undefined}>{label}</li>)}
  </ol>;
}

function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => { element?.close(); };
  }, []);
  return (
    <dialog ref={dialog} aria-labelledby={titleId} onClose={close}>
      <div className="flex items-start justify-between gap-4">
        <h2 id={titleId}>{title}</h2>
        <button className="secondary" type="button" onClick={close}>Fechar</button>
      </div>
      {children}
    </dialog>
  );
}

function ItemSummary({ items }: { items: DemoCartItem[] }) {
  return <ul className="divide-y divide-slate-200">
    {items.map(item => <li key={JSON.stringify([item.productId, item.selectedOptions])} className="flex justify-between gap-4 py-3">
      <span>{item.quantity} × {products.get(item.productId)?.name}
        {item.selectedOptions.length > 0 && <small className="block text-slate-600">{item.selectedOptions.join(', ')}</small>}
      </span>
      <strong className="shrink-0">{formatPrice(item.quantity * item.unitPrice)}</strong>
    </li>)}
  </ul>;
}

function DemoCatalog({ report }: { report: (error: unknown) => void }) {
  const session = useDemoSession();
  const [cartMessage, setCartMessage] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');
  const [product, setProduct] = useState<DemoProduct>();
  const [options, setOptions] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [checkout, setCheckout] = useState(false);
  const [payment, setPayment] = useState<PaymentMethod>();
  const [confirmation, setConfirmation] = useState<string>();
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const order = session.orders.find(item => item.id === confirmation);

  function changeQuantity(selected: DemoProduct, quantityChange: number, selectedOptions: string[] = []) {
    return mutateSession(current => {
      const unitPrice = priceWithOptions(selected, selectedOptions);
      if (!selected.available || unitPrice === undefined) throw new Error('Revise os complementos escolhidos.');
      const item = current.cart.find(entry => entry.productId === selected.id &&
        JSON.stringify(entry.selectedOptions) === JSON.stringify(selectedOptions));
      const updated = (item?.quantity ?? 0) + quantityChange;
      if (updated > maxQuantity) throw new Error('O limite é de 20 unidades por produto.');
      const next = { productId: selected.id, quantity: updated, unitPrice, notes: '', selectedOptions };
      const cart = updated <= 0 ? current.cart.filter(entry => entry !== item)
        : item ? current.cart.map(entry => entry === item ? next : entry) : [...current.cart, next];
      return { ...current, cart };
    });
  }

  async function confirm() {
    if (!payment || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    try {
      const updated = await mutateSession(current => {
        if (current.sessionId !== session.sessionId) throw new Error('A demonstração foi reiniciada.');
        return createOrder(current, session.cart, payment, item => {
          const selected = products.get(item.productId);
          return selected?.available ? priceWithOptions(selected, item.selectedOptions) : undefined;
        });
      });
      setCheckout(false);
      setConfirmation(updated.selectedOrderId ?? undefined);
    } catch (error) {
      report(error);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const normalize = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR');
  const searchTerm = normalize(query.trim());
  const visibleProducts = catalog.filter(item =>
    (category === 'Todos' || item.category === category) &&
    normalize(`${item.name} ${item.description}`).includes(searchTerm)
  );
  const itemCount = session.cart.reduce((sum, item) => sum + item.quantity, 0);

  return <>
    <section className="hero">
      <div className="hero-copy">
        <h1>Restaurante Demonstração Aladay</h1>
        <p>Monte um pedido e acompanhe cada etapa no painel do restaurante.</p>
      </div>
      <img src={catalog[0].image} alt="" fetchPriority="high" />
    </section>
    <DemoGuide step={order ? 4 : checkout ? 3 : product || session.cart.length ? 2 : 1} />
    <div className="menu-grid">
      <section aria-labelledby="menu-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="menu-title">Cardápio</h2>
          <a href="#cart-title" className="secondary"><ShoppingBag size={17} aria-hidden="true" /> Ver carrinho ({itemCount})</a>
        </div>
        <p className={cartMessage ? 'feedback mt-3' : 'sr-only'} role="status">{cartMessage}</p>
        <div className="mt-4">
          <SearchInput label="Buscar na demonstração" placeholder="Buscar produto ou ingrediente" value={query} onChange={setQuery} />
        </div>
        <div className="my-4 flex flex-wrap gap-2" aria-label="Categorias">
          {categories.map(name => <button key={name} type="button" className="secondary" aria-pressed={category === name} onClick={() => setCategory(name)}>{name}</button>)}
        </div>
        <div className="product-grid">
          {visibleProducts.length === 0 && <p className="surface text-sm text-slate-600" role="status">Nenhum produto encontrado. Experimente outro termo ou categoria.</p>}
          {visibleProducts.map(item => (
            <article key={item.id} className="surface flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <h3>{item.name}</h3><strong className="shrink-0 text-blue-800">{formatPrice(item.price)}</strong>
              </div>
              <p className="grow text-sm text-slate-600">{item.description}</p>
              <button className="secondary self-start" type="button" disabled={!item.available} onClick={() => { setQuantity(1); setOptions([]); setProduct(item); }}>
                {item.available ? 'Escolher' : 'Indisponível'}<span className="sr-only"> {item.name}</span>
              </button>
            </article>
          ))}
        </div>
      </section>
      <aside className="surface cart" aria-labelledby="cart-title">
        <h2 id="cart-title" tabIndex={-1} className="flex items-center gap-2"><ShoppingBag aria-hidden="true" size={21} /> Carrinho</h2>
        {!session.cart.length ? <p className="mt-3 text-slate-600">Seu carrinho está vazio.</p> : <>
          <ul className="mt-3 divide-y divide-slate-200">
            {session.cart.map(item => {
              const selected = products.get(item.productId);
              if (!selected) return null;
              const lineName = [selected.name, ...item.selectedOptions].join(', ');
              return <li key={JSON.stringify([item.productId, item.selectedOptions])} className="py-3">
                <div className="flex justify-between gap-3"><strong>{lineName}</strong><span>{formatPrice(item.quantity * item.unitPrice)}</span></div>
                <div className="mt-2 flex items-center gap-2">
                  <button className="secondary step" type="button" aria-label={'Diminuir quantidade de ' + lineName} disabled={item.quantity === 1} onClick={() => void changeQuantity(selected, -1, item.selectedOptions).catch(report)}>−</button>
                  <output aria-label={'Quantidade de ' + lineName}>{item.quantity}</output>
                  <button className="secondary step" type="button" aria-label={'Aumentar quantidade de ' + lineName} disabled={item.quantity === maxQuantity} onClick={() => void changeQuantity(selected, 1, item.selectedOptions).catch(report)}>+</button>
                  <button className="secondary ml-auto" type="button" aria-label={'Remover ' + lineName} onClick={() => void changeQuantity(selected, -item.quantity, item.selectedOptions).catch(report)}>Remover</button>
                </div>
              </li>;
            })}
          </ul>
          <div className="mb-4 flex justify-between border-t border-slate-200 pt-4 font-bold"><span>Total</span><span>{formatPrice(totalOf(session.cart))}</span></div>
          <button className="primary w-full" type="button" onClick={() => { setPayment(undefined); setCheckout(true); }}>Revisar pedido <ArrowRight size={17} aria-hidden="true" /></button>
        </>}
      </aside>
    </div>
    {product && <Modal title={product.name} close={() => setProduct(undefined)}>
      <p className="my-4 text-slate-600">{product.description}</p>
      <label className="grid gap-2 font-bold">Quantidade
        <select value={quantity} onChange={event => setQuantity(Number(event.target.value))}>
          {Array.from({ length: maxQuantity }, (_, index) => <option key={index}>{index + 1}</option>)}
        </select>
      </label>
      {product.options && <fieldset className="mt-4 grid gap-2">
        <legend className="mb-2 font-bold">Complementos opcionais</legend>
        {product.options.map(option => (
          <label key={option.name} className="payment">
            <input type="checkbox" checked={options.includes(option.name)} onChange={event =>
              setOptions(current => event.target.checked ? [...current, option.name].sort() : current.filter(name => name !== option.name))
            } />
            {option.name} · +{formatPrice(option.price)}
          </label>
        ))}
      </fieldset>}
      <button type="button" className="primary mt-5 w-full" onClick={() => {
        void changeQuantity(product, quantity, options).then(() => {
          setProduct(undefined);
          setCartMessage(product.name + ' adicionado ao carrinho.');
        }).catch(error => { setProduct(undefined); report(error); });
      }}>Adicionar ao carrinho · {formatPrice(quantity * (priceWithOptions(product, options) ?? product.price))}</button>
    </Modal>}
    {checkout && <Modal title="Checkout simulado" close={() => setCheckout(false)}>
      <ItemSummary items={session.cart} />
      <p className="flex justify-between border-t border-slate-200 py-3 font-bold"><span>Total</span><span>{formatPrice(totalOf(session.cart))}</span></p>
      <fieldset className="my-3 grid gap-2">
        <legend className="mb-2 font-bold">Forma de pagamento fictícia</legend>
        {paymentMethods.map(method => <label key={method} className="payment">
          <input type="radio" name="payment" checked={payment === method} onChange={() => setPayment(method)} /> {method}
        </label>)}
      </fieldset>
      {payment === 'Pix simulado' && <p className="mb-3 text-sm text-slate-600">Simulação sem validade financeira. Nenhum QR Code é gerado.</p>}
      <button className="primary w-full" type="button" disabled={!payment || busy || !session.cart.length} onClick={() => void confirm().catch(report)}>
        {busy ? 'Confirmando…' : 'Confirmar pedido simulado'}
      </button>
    </Modal>}
    {order && <Modal title="Pedido simulado recebido" close={() => setConfirmation(undefined)}>
      <p className="my-4"><strong>#{order.id}</strong> · {statusLabel[order.status]}</p>
      <a className="primary" href={panelPath}>Ver pedido no painel <ArrowRight size={17} aria-hidden="true" /></a>
    </Modal>}
  </>;
}

function OrderDetails({ order, report }: { order: DemoOrder; report: (error: unknown) => void }) {
  const session = useDemoSession();
  const next = nextStatus(order.status);
  return <section className="surface" aria-labelledby="details-title">
    <h2 id="details-title">Pedido #{order.id}</h2>
    <p className="mt-2 text-sm text-slate-600"><time dateTime={order.createdAt}>{date.format(new Date(order.createdAt))}</time> · horário de Brasília</p>
    <p className="mt-2" aria-live="polite"><span className="status">{statusLabel[order.status]}</span></p>
    <div className="my-3"><ItemSummary items={order.items} /></div>
    <p className="flex justify-between border-t border-slate-200 py-3 font-bold"><span>Total simulado</span><span>{formatPrice(order.total)}</span></p>
    <p className="text-sm text-slate-600">{order.paymentMethod} · sem cobrança</p>
    {next && <button className="primary mt-4" type="button" onClick={() => {
      void mutateSession(current => ({
        ...current,
        orders: current.orders.map(item => current.sessionId === session.sessionId && item.id === order.id && item.status === order.status ? { ...item, status: next } : item),
      })).catch(report);
    }}>Marcar como {statusLabel[next].toLowerCase()}</button>}
  </section>;
}

function DemoDashboard({ report }: { report: (error: unknown) => void }) {
  const session = useDemoSession();
  const { orders } = session;
  const selected = orders.find(order => order.id === session.selectedOrderId) ?? orders[0];
  const orderTotal = orders.reduce((sum, order) => sum + order.total, 0);
  const metrics = [
    ['Pedidos da sessão', orders.length],
    ...(['RECEBIDO', 'EM_PREPARO', 'PRONTO', 'CONCLUIDO'] as const).map(status => [statusLabel[status], orders.filter(order => order.status === status).length]),
    ['Valor total simulado', formatPrice(orderTotal)],
    ['Ticket médio simulado', orders.length ? formatPrice(Math.round(orderTotal / orders.length)) : '—'],
  ];
  return <>
    <div className="panel-intro">
      <ChefHat size={28} aria-hidden="true" />
      <h1>Painel do restaurante</h1>
      <p>Restaurante Demonstração Aladay</p>
    </div>
    <DemoGuide step={5} />
    <dl className="metrics">{metrics.map(([label, value]) => <div className="surface" key={label}>
      <dt>{label}</dt><dd>{value}</dd>
    </div>)}</dl>
    {orders.length ? <div className="dashboard-grid">
      <section className="surface" aria-labelledby="orders-title">
        <h2 id="orders-title">Pedidos da sessão</h2>
        <ul className="mt-3 grid gap-2">{orders.map(order => <li key={order.id}>
          <button type="button" className="secondary order-row" aria-pressed={order.id === selected?.id} onClick={() => {
            void mutateSession(current => current.sessionId === session.sessionId ? { ...current, selectedOrderId: order.id } : current).catch(report);
          }}>
            <span>#{order.id}<small>{date.format(new Date(order.createdAt))}</small></span><span className="status">{statusLabel[order.status]}</span>
          </button>
        </li>)}</ul>
      </section>
      {selected && <OrderDetails order={selected} report={report} />}
    </div> : <section className="surface">
      <h2>Nenhum pedido na sessão</h2>
      <p className="my-3 text-slate-600">Finalize um pedido no cardápio para acompanhar o preparo aqui.</p>
      <a className="primary" href={menuPath}>Abrir cardápio <ArrowRight size={17} aria-hidden="true" /></a>
    </section>}
    <section className="surface mt-4" aria-labelledby="demo-catalog-overview">
      <h2 id="demo-catalog-overview">Produtos e categorias da demonstração</h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {categories.filter(category => category !== 'Todos').map(category => (
          <li key={category} className="rounded-lg border border-aladay-line p-3">
            <h3>{category}</h3>
            <ul className="mt-1 space-y-1 text-sm text-slate-600">
              {catalog.filter(product => product.category === category).map(product => (
                <li key={product.id} className="flex flex-wrap justify-between gap-x-3">
                  <span>{product.name}</span><span>{formatPrice(product.price)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  </>;
}

function DemoLayout() {
  const panel = location.pathname.toLowerCase().replace(/\/$/, '') === panelPath;
  const [reset, setReset] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const session = useDemoSession();
  const report = (problem: unknown) => setError(problem instanceof Error ? problem.message : 'A simulação encontrou um erro. Tente novamente.');
  return <>
    <a className="skip" href="#demo-main">Pular para o conteúdo</a>
    <header className="demo-header">
      <p className="notice">Ambiente de demonstração — nenhum pedido ou pagamento real será realizado.</p>
      <div className="demo-container header-row">
        <a href="/" className="brand"><span aria-hidden="true">A</span>Aladay</a>
        <nav aria-label="Visões da demonstração">
          <a href={menuPath} aria-current={panel ? undefined : 'page'}><Utensils size={17} aria-hidden="true" /> Cardápio</a>
          <a href={panelPath} aria-current={panel ? 'page' : undefined}><LayoutDashboard size={17} aria-hidden="true" /> Painel</a>
        </nav>
        <button className="secondary" type="button" onClick={() => setReset(true)}><RotateCcw size={16} aria-hidden="true" /> Reiniciar <span className="sr-only">demonstração</span></button>
      </div>
    </header>
    <main id="demo-main" className="demo-container demo-main">
      {status && <p className="feedback" role="status">{status}</p>}
      {panel ? <DemoDashboard report={report} /> : <DemoCatalog key={session.sessionId} report={report} />}
      <footer className="demo-footer">
        <div><h2>Gostou da experiência? Comece seu teste grátis.</h2></div>
        <a href="/" className="secondary">Voltar ao site Aladay</a>
        <a href="/?teste-gratis=1" className="primary">Iniciar teste grátis <ArrowRight size={17} aria-hidden="true" /></a>
      </footer>
    </main>
    {reset && <Modal title="Reiniciar demonstração?" close={() => setReset(false)}>
      <p className="my-4">O carrinho e todos os pedidos simulados serão limpos.</p>
      <button type="button" className="primary" onClick={() => {
        void mutateSession(emptySession).then(() => { setReset(false); setStatus('Demonstração reiniciada.'); }).catch(problem => { setReset(false); report(problem); });
      }}>Limpar dados da demonstração</button>
    </Modal>}
    {error && <Modal title="Revise a simulação" close={() => setError('')}><p className="my-4" role="alert">{error}</p></Modal>}
  </>;
}

createRoot(document.getElementById('root')!).render(<DemoLayout />);

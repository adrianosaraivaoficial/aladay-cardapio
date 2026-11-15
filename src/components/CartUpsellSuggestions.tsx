import { useEffect, useRef, useState } from 'react';
import { OrderItem, Product } from '../types';
import { getConsentStatus } from '../utils/analytics';

type Offer = { offerId: string; ruleId: string; product: Pick<Product, 'id' | 'name' | 'description' | 'priceCents' | 'imageUrl' | 'categoryId'> };
export type UpsellAttribution = { sessionId: string; checkoutId: string; offerId: string; productId: string };
const sessions = new Map<string, { sessionId: string; checkoutId: string }>();
export function resetUpsellCheckout(slug: string) { const previous = sessions.get(slug); if (previous) sessions.set(slug, { ...previous, checkoutId: crypto.randomUUID() }); }
export function CartUpsellSuggestions({ tenantSlug, enabled, cart, products, onChoose }: { tenantSlug: string; enabled: boolean; cart: OrderItem[]; products: Product[]; onChoose: (product: Product, onAdded: () => Promise<UpsellAttribution | null>) => void }) {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ids = useRef<{ sessionId: string; checkoutId: string } | null>(null);
  const displayed = useRef(new Set<string>());
  const cartKey = JSON.stringify(cart.map(item => ({ productId: item.productId, quantity: item.quantity })));
  const currentCart = useRef(cartKey);
  currentCart.current = cartKey;
  useEffect(() => { setOffers(null); setError(''); }, [cartKey, enabled]);
  useEffect(() => { if (enabled && offers) offers.forEach(offer => { if (!displayed.current.has(offer.offerId)) { displayed.current.add(offer.offerId); void event(offer, 'impression'); } }); }, [offers, enabled]);
  if (!enabled || !cart.length) return null;
  async function event(offer: Offer, kind: 'impression' | 'add_to_cart') {
    if (!enabled || !ids.current || getConsentStatus() !== 'granted') return false;
    try { const response = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/upsell/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: crypto.randomUUID(), offerId: offer.offerId, sessionId: ids.current.sessionId, kind }) }); return response.ok; } catch { return false; }
  }
  async function load() {
    setBusy(true); setError('');
    if (!ids.current) { ids.current = sessions.get(tenantSlug) || { sessionId: crypto.randomUUID(), checkoutId: crypto.randomUUID() }; sessions.set(tenantSlug, ids.current); }
    try {
      const query = new URLSearchParams({ ...ids.current, requestId: crypto.randomUUID(), cart: cartKey });
      const response = await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/upsell/suggestions?${query}`);
      const data = await response.json(); if (!response.ok) throw new Error(data.message || data.error || 'Sugestões indisponíveis neste momento.');
      const visible = (data.suggestions as Offer[]).filter(offer => products.some(p => p.id === offer.product.id && p.isAvailable));
      if (currentCart.current === cartKey) setOffers(visible);
    } catch (e) { setError(e instanceof Error ? e.message : 'Não foi possível consultar sugestões.'); } finally { setBusy(false); }
  }
  return <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 space-y-3"><h3 className="text-xs font-bold">Quer complementar seu pedido?</h3><p className="text-xs text-slate-600">Veja sugestões opcionais para os itens da sacola.</p>{error && <p role="alert" className="text-xs text-rose-700">{error}</p>}{offers === null && <button type="button" className="rounded-lg border border-blue-300 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50" disabled={busy} onClick={load}>{busy ? 'Buscando sugestões…' : 'Mostrar sugestões'}</button>}{offers && !offers.length && <p role="status" className="text-xs text-slate-600">Nenhuma sugestão disponível para esta sacola.</p>}{offers?.map(offer => <div key={offer.offerId} className="flex items-center justify-between gap-3 rounded-lg bg-white p-3"><div><p className="text-xs font-bold">{offer.product.name}</p><p className="text-xs">{(offer.product.priceCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p></div><button type="button" className="rounded-lg border border-blue-300 px-3 py-2 text-xs font-semibold" onClick={() => { const product = products.find(p => p.id === offer.product.id && p.isAvailable); if (product) onChoose(product, async () => await event(offer, 'add_to_cart') && ids.current ? { ...ids.current, offerId: offer.offerId, productId: product.id } : null); }}>Personalizar e adicionar</button></div>)}</div>;
}

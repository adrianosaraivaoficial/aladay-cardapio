import { getConsentStatus } from './analytics';

const sessions = new Map<string, string>();
export function intelligenceSession(tenantSlug: string): string | null {
  if (getConsentStatus() !== 'granted') { sessions.delete(tenantSlug); return null; }
  let id = sessions.get(tenantSlug);
  if (!id) { id = crypto.randomUUID(); sessions.set(tenantSlug, id); }
  return id;
}
export async function emitIntelligenceEvent(tenantSlug: string, enabled: boolean, kind: 'menu_view' | 'product_view' | 'product_click' | 'checkout_start', productId?: string) {
  if (!enabled || getConsentStatus() !== 'granted') return;
  const sessionId = intelligenceSession(tenantSlug);
  if (!sessionId) return;
  const params = new URLSearchParams(window.location.search);
  const channel = params.has('mesa') ? 'qr' : params.get('canal') === 'whatsapp' || params.has('repetir') || params.has('item') ? 'whatsapp' : 'web';
  try {
    await fetch(`/api/v1/tenants/${encodeURIComponent(tenantSlug)}/analytics/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ eventId: crypto.randomUUID(), sessionId, kind, channel, ...(productId ? { productId } : {}) }) });
  } catch { /* Telemetry must never interrupt shopping. */ }
}

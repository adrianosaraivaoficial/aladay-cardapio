import { useEffect, useState } from 'react';
import { getConsentStatus, setConsentStatus } from '../utils/analytics';

export function ConsumerAnalyticsConsent({ enabled }: { enabled: boolean }) {
  const [consent, setConsent] = useState(getConsentStatus);
  useEffect(() => { const update = () => setConsent(getConsentStatus()); window.addEventListener('aladay-consent-change', update); window.addEventListener('storage', update); return () => { window.removeEventListener('aladay-consent-change', update); window.removeEventListener('storage', update); }; }, []);
  if (!enabled) return null;
  return <details open={consent === 'pending'} className="mx-4 my-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs"><summary className="cursor-pointer font-semibold">Preferências de métricas · {consent === 'granted' ? 'Autorizadas' : consent === 'denied' ? 'Apenas essenciais' : 'Aguardando escolha'}</summary><p className="mt-2 text-slate-600">Você pode autorizar métricas opcionais de visualização do cardápio, produtos e início de checkout. Os eventos usam um identificador temporário em memória e não incluem nome, telefone ou endereço. Sua escolha não afeta o pedido e pode ser alterada aqui.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="rounded-lg bg-blue-700 px-3 py-2 font-semibold text-white" onClick={() => setConsentStatus('granted', { initializeGA4: false })}>Aceitar métricas</button><button type="button" className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold" onClick={() => setConsentStatus('denied', { initializeGA4: false })}>Apenas essenciais</button></div></details>;
}

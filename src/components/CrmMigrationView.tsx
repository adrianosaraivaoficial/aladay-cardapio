import { useState } from 'react';
import { AuthSession, CustomerRecord, RestaurantTenant } from '../types';

type Preview = { previewHash: string; differences: Array<{ phone: string; originalPhone: string; phoneNormalized: boolean; previous: { name: string; notes: string; marketingConsent: boolean } | null; incoming: { name: string; phone: string; notes: string; marketingConsent: boolean }; changes: string[] }>; summary: { total: number; created: number; updated: number }; expiresAt: string };
const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm';
const button = 'rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed';

export function CrmMigrationView({ tenant, authSession, onMigrated }: { tenant: RestaurantTenant; authSession?: AuthSession | null; onMigrated?: () => void }) {
  const [sourceSlug, setSourceSlug] = useState('');
  const [retentionDays, setRetentionDays] = useState(30);
  const [legacy, setLegacy] = useState<CustomerRecord[] | null>(null);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  function invalidate() { setPreview(null); setConfirmed(false); setMessage(''); }
  async function post<T>(endpoint: string, body: unknown): Promise<T> {
    const response = await fetch(`/api/v1/tenants/${encodeURIComponent(tenant.slug)}/customers/${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authSession?.token ? { Authorization: `Bearer ${authSession.token}` } : {}) }, body: JSON.stringify(body) });
    const data = await response.json(); if (!response.ok) throw new Error(data.message || data.error || 'Não foi possível concluir a migração.'); return data;
  }
  async function perform(work: () => Promise<void>) { setBusy(true); setError(''); setMessage(''); try { await work(); } catch (e) { setError(e instanceof Error ? e.message : 'Falha inesperada.'); } finally { setBusy(false); } }
  function readLegacy() {
    setError(''); setSelected({}); invalidate();
    try {
      const raw = localStorage.getItem('aladay_prod_customers_v2');
      if (!raw) { setLegacy([]); setMessage('Nenhum cadastro legado foi encontrado neste navegador.'); return; }
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('O cache legado tem formato desconhecido. Nenhum dado foi alterado.');
      const records = parsed.map((entry: unknown) => {
        if (!entry || typeof entry !== 'object') throw new Error('O cache contém um cadastro inválido.');
        const c = entry as Partial<CustomerRecord>;
        if (typeof c.phone !== 'string' || typeof c.name !== 'string') throw new Error('O cache contém cadastro sem nome ou telefone.');
        return { ...c, name: c.name, phone: c.phone, marketingConsent: c.marketingConsent === true, notes: typeof c.notes === 'string' ? c.notes : '' } as CustomerRecord;
      });
      setLegacy(records); setMessage(`${records.length} cadastro(s) legado(s) lido(s). Confirme explicitamente a origem antes de gerar a prévia.`);
    } catch (e) { setLegacy(null); setError(e instanceof Error ? e.message : 'Não foi possível ler o cache legado.'); }
  }
  return <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50/40 p-5 space-y-4" aria-label="Migração assistida de clientes">
    <h3 className="font-semibold text-slate-900">Migração assistida de clientes legados</h3>
    <p className="text-sm text-slate-600">O cadastro antigo deste navegador pode conter clientes de diferentes restaurantes. Só prossiga se todos os registros selecionados pertencerem à origem informada. O cache original será preservado. Consentimento ausente será considerado não autorizado.</p>
    {error && <p role="alert" className="rounded-lg bg-rose-100 p-3 text-sm text-rose-900">{error}</p>}
    {message && <p role="status" className="text-sm text-slate-700">{message}</p>}
    <button type="button" className={button} disabled={busy} onClick={readLegacy}>Ler cadastro legado deste navegador</button>
    {legacy && legacy.length > 0 && <>
      <p className="text-sm">Selecione somente os registros que pertencem à origem informada:</p>
      <div className="max-h-52 overflow-y-auto rounded-lg border bg-white p-3 space-y-2">{legacy.map((customer, index) => <label key={index} className="flex items-start gap-2 text-sm"><input type="checkbox" disabled={busy} checked={selected[index] === true} onChange={e => { setSelected(previous => ({ ...previous, [index]: e.target.checked })); invalidate(); }} /><span>{customer.name} · {customer.phone} · {customer.marketingConsent ? 'Consentimento autorizado' : 'Sem consentimento'}</span></label>)}</div>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Slug do restaurante de origem<input className={`${input} mt-1`} value={sourceSlug} disabled={busy} onChange={e => { setSourceSlug(e.target.value); invalidate(); }} placeholder="Digite a origem confirmada" /></label><label className="text-sm">Retenção do registro de migração (dias)<input className={`${input} mt-1`} type="number" min="1" max="90" value={retentionDays} disabled={busy} onChange={e => { setRetentionDays(Number(e.target.value)); invalidate(); }} /></label></div>
      <p className="text-sm">Destino: <strong>{tenant.name}</strong> ({tenant.slug}). A origem informada deve corresponder ao restaurante de destino para preservar o isolamento.</p>
      <button type="button" className={button} disabled={busy || !sourceSlug.trim() || !Object.values(selected).some(Boolean) || retentionDays < 1 || retentionDays > 90} onClick={() => perform(async () => { const data = await post<Preview>('migration-preview', { sourceTenantSlug: sourceSlug.trim(), customers: legacy.filter((_, index) => selected[index]), retentionDays }); setPreview(data); setConfirmed(false); })}>{busy ? 'Processando…' : 'Gerar prévia de diferenças'}</button>
      {preview && <div className="space-y-3"><p className="text-sm">{preview.summary.total} registros · {preview.summary.created} novos · {preview.summary.updated} atualizados. Prévia válida até {new Date(preview.expiresAt).toLocaleString('pt-BR')}.</p><div className="max-h-80 overflow-auto rounded-lg border bg-white"><table className="w-full text-xs"><thead className="bg-slate-100"><tr><th className="p-2 text-left">Telefone original → normalizado</th><th className="p-2 text-left">Nome / notas: antes → depois</th><th className="p-2 text-left">Consentimento: antes → depois</th></tr></thead><tbody>{preview.differences.map((d, i) => <tr key={`${d.phone}_${i}`} className="border-t"><td className="p-2">{d.originalPhone} → {d.phone}<p>{d.changes.join(', ')}</p></td><td className="p-2"><p>{d.previous?.name || 'Novo'} → {d.incoming.name}</p><p className="whitespace-pre-wrap">{d.previous?.notes || 'Sem notas'} → {d.incoming.notes || 'Sem notas'}</p></td><td className="p-2">{d.previous?.marketingConsent ? 'Autorizado' : 'Não autorizado'} → {d.incoming.marketingConsent ? 'Autorizado' : 'Não autorizado'}</td></tr>)}</tbody></table></div><label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />Confirmo a origem, o destino, o prazo de retenção e as diferenças de telefone, notas e consentimento. Autorizo importar estes registros para este restaurante.</label><button type="button" className={button} disabled={busy || !confirmed} onClick={() => perform(async () => { const data = await post<{ imported: number; duplicate?: boolean }>('migrate', { previewHash: preview.previewHash, confirmed: true, sourceTenantSlug: sourceSlug.trim(), retentionDays }); setPreview(null); setConfirmed(false); setMessage(data.duplicate ? 'Esta migração já foi aplicada. Nenhum registro duplicado foi criado.' : `Migração concluída: ${data.imported} cadastro(s). O cache legado foi preservado.`); onMigrated?.(); })}>Confirmar migração revisada</button></div>}
    </>}
  </section>;
}

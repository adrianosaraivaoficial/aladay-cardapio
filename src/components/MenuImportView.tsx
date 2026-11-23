import { StatusNotice } from './StatusNotice';
import { useEffect, useRef, useState } from 'react';
import { AuthSession, Category, Product, RestaurantTenant } from '../types';

type Feature = 'menu_import' | 'analytics' | 'upsell' | 'feedback';
type Intelligence = { features: Record<Feature, { released: boolean; enabled: boolean }>; monthlyBudgetCents: number };
type CandidateProduct = Omit<Product, 'priceCents'> & { priceCents: number | null };
type Candidates = { categories: Category[]; products: CandidateProduct[] };
type Job = { id: string; version: number; status: string; filename?: string; candidates: Candidates; warnings?: string[] };
type Result = { job: Job; catalogHash: string; diffHash: string; diff: { categoriesAdded: unknown[]; categoriesUpdated: unknown[]; productsAdded: unknown[]; productsUpdated: unknown[]; duplicates: unknown[] } };
const labels: Record<Feature, string> = { menu_import: 'Importador de cardápio', analytics: 'Analytics', upsell: 'Sugestões de complementos', feedback: 'Feedback e avaliações' };
const inputClass = 'aladay-field';
const buttonClass = 'aladay-action aladay-action-secondary';

export function MenuImportView({ tenant, authSession }: { tenant: RestaurantTenant; authSession?: AuthSession | null }) {
  const [config, setConfig] = useState<Intelligence | null>(null);
  const [budget, setBudget] = useState('0');
  const [configDirty, setConfigDirty] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [draft, setDraft] = useState<Candidates | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [confirmDuplicates, setConfirmDuplicates] = useState(false);
  const [source, setSource] = useState<{ url: string; mime: string; name: string; contentBase64: string } | null>(null);
  const [authorizeAi, setAuthorizeAi] = useState(false);
  const [resumeId, setResumeId] = useState('');
  const objectUrl = useRef<string | null>(null);
  const isSuperAdmin = authSession?.user.role === 'SUPER_ADMIN';
  const base = `/api/v1/tenants/${encodeURIComponent(tenant.slug)}`;
  const available = Boolean(!configDirty && config?.features.menu_import.released && config.features.menu_import.enabled);

  async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(authSession?.token ? { Authorization: `Bearer ${authSession.token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || `Não foi possível concluir (${response.status}).`);
    return data as T;
  }
  async function action(label: string, work: () => Promise<void>) {
    setBusy(label); setError(''); setNotice('');
    try { await work(); } catch (e) { setError(e instanceof Error ? e.message : 'Falha inesperada. Tente novamente.'); } finally { setBusy(''); }
  }
  const loadConfig = () => action('Carregando configuração', async () => {
    const data = await request<Intelligence>('/intelligence'); setConfig(data); setConfigDirty(false); setBudget(String(data.monthlyBudgetCents / 100));
  });
  useEffect(() => {
    let active = true;
    setConfig(null); setConfigDirty(false); setResult(null); setDraft(null); setSource(null); setError(''); setNotice(''); setDirty(false); setConfirm(false); setConfirmDuplicates(false); setResumeId('');
    setBusy('Carregando configuração');
    request<Intelligence>('/intelligence').then(data => { if (active) { setConfig(data); setBudget(String(data.monthlyBudgetCents / 100)); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setBusy(''); });
    return () => { active = false; if (objectUrl.current) { URL.revokeObjectURL(objectUrl.current); objectUrl.current = null; } };
  }, [tenant.slug, authSession?.token]);

  function acceptResult(data: Result) { setResult(data); setDraft(data.job.candidates); setResumeId(data.job.id); setDirty(false); setConfirm(false); setConfirmDuplicates(false); setAuthorizeAi(false); }
  function edit(next: Candidates) { setDraft(next); setDirty(true); setConfirm(false); setConfirmDuplicates(false); setNotice(''); }
  function editProduct(id: string, patch: Partial<CandidateProduct>) { if (draft) edit({ ...draft, products: draft.products.map(p => p.id === id ? { ...p, ...patch } : p) }); }
  async function upload(file?: File) {
    if (!file) return;
    if (file.size > 650 * 1024) { setError('O arquivo deve ter no máximo 650 KB.'); return; }
    await action('Enviando arquivo', async () => {
      const mime = file.type || (/\.csv$/i.test(file.name) ? 'text/csv' : /\.xlsx$/i.test(file.name) ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/octet-stream');
      const encoded = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.')); reader.readAsDataURL(file); });
      acceptResult(await request<Result>('/menu-imports', 'POST', { filename: file.name, mimeType: mime, contentBase64: encoded }));
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      objectUrl.current = URL.createObjectURL(file); setSource({ url: objectUrl.current, name: file.name, mime, contentBase64: encoded });
      setNotice('Rascunho criado. Revise os dados antes de publicar.');
    });
  }
  const editable = Boolean(draft && result?.job.status !== 'published' && available && !busy);
  const invalid = !draft || !draft.products.length || draft.categories.some(c => !c.name.trim()) || draft.products.some(p => !p.name.trim() || p.priceCents === null || !Number.isSafeInteger(p.priceCents) || p.priceCents < 0 || !draft.categories.some(c => c.id === p.categoryId));
  const duplicates = result?.diff?.duplicates.length || 0;
  const published = result?.job.status === 'published';

  return <section className="aladay-keyboard mx-auto max-w-6xl min-w-0 scroll-mt-32 space-y-6" id="inteligencia-importacao" tabIndex={-1} aria-label="Inteligência do restaurante">
    <div><h2 className="text-xl font-bold text-slate-900">Inteligência</h2><p className="mt-1 text-sm text-slate-600">Configuração e importação assistida para {tenant.name}. Recursos começam desativados; nenhuma publicação é automática.</p></div>
    {error && <StatusNotice tone="error">{error}</StatusNotice>}
    {notice && <StatusNotice tone="success">{notice}</StatusNotice>}
    {busy && <StatusNotice tone="progress">{busy}…</StatusNotice>}
    {!config && !busy && <button type="button" className={buttonClass} onClick={loadConfig}>Tentar carregar configuração novamente</button>}
    {config && <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
      <h3 className="font-semibold">Disponibilidade e orçamento</h3>
      {configDirty && <p className="text-sm text-amber-900">Configuração ainda não salva. Salve para aplicar as alterações.</p>}
      <div className="grid gap-3 sm:grid-cols-2">{(Object.keys(labels) as Feature[]).map(feature => <div key={feature} className="rounded-lg border border-slate-200 p-3">
        <p className="text-sm font-semibold">{labels[feature]}</p><p className="mt-1 text-xs text-slate-600">{config.features[feature]?.released ? 'Liberado pelo administrador' : 'Aguardando liberação'} · {config.features[feature]?.enabled ? 'Ativado para este restaurante' : 'Desativado neste restaurante'}</p>
        {feature !== 'menu_import' && (isSuperAdmin ? <div className="mt-2 flex flex-wrap gap-3 text-xs"><label className="flex gap-1 items-center"><input type="checkbox" checked={config.features[feature].released} disabled={Boolean(busy)} onChange={e => { setConfigDirty(true); setConfig({ ...config, features: { ...config.features, [feature]: { released: e.target.checked, enabled: e.target.checked && config.features[feature].enabled } } }); }} />Liberar</label><label className="flex gap-1 items-center"><input type="checkbox" checked={config.features[feature].enabled} disabled={Boolean(busy) || !config.features[feature].released} onChange={e => { setConfigDirty(true); setConfig({ ...config, features: { ...config.features, [feature]: { ...config.features[feature], enabled: e.target.checked } } }); }} />Ativar</label></div> : <button type="button" className={`${buttonClass} mt-2`} disabled={Boolean(busy) || !config.features[feature].enabled} onClick={() => action('Desativando recurso', async () => { setConfig(await request<Intelligence>('/intelligence', 'PATCH', { feature, enabled: false })); setNotice('Recurso desativado.'); })}>Desativar</button>)}
      </div>)}</div>
      {isSuperAdmin ? <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={config.features.menu_import.released} disabled={Boolean(busy)} onChange={e => { setConfigDirty(true); setConfig({ ...config, features: { ...config.features, menu_import: { released: e.target.checked, enabled: e.target.checked && config.features.menu_import.enabled } } }); }} />Liberar importador</label>
        <label className="text-sm flex items-center gap-2"><input type="checkbox" checked={config.features.menu_import.enabled} disabled={Boolean(busy) || !config.features.menu_import.released} onChange={e => { setConfigDirty(true); setConfig({ ...config, features: { ...config.features, menu_import: { ...config.features.menu_import, enabled: e.target.checked } } }); }} />Ativar importador</label>
        <label className="text-sm space-y-1">Orçamento mensal (R$)<input className={inputClass} type="number" min="0" step="0.01" value={budget} onChange={e => { setConfigDirty(true); setBudget(e.target.value); }} /></label>
        <button type="button" className={buttonClass} disabled={Boolean(busy) || budget.trim() === '' || !Number.isFinite(Number(budget)) || Number(budget) < 0} onClick={() => action('Salvando configuração', async () => { const data = await request<Intelligence>('/intelligence', 'PUT', { features: config.features, monthlyBudgetCents: Math.round(Number(budget) * 100) }); setConfig(data); setConfigDirty(false); setNotice('Configuração salva.'); })}>Salvar configuração</button>
      </div> : <div className="flex flex-wrap items-center gap-4"><p className="text-sm">Orçamento mensal: {(config.monthlyBudgetCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p><button type="button" className={buttonClass} disabled={Boolean(busy) || !config.features.menu_import.enabled} onClick={() => action('Desativando importador', async () => { const data = await request<Intelligence>('/intelligence', 'PATCH', { feature: 'menu_import', enabled: false }); setConfig(data); setNotice('Importador desativado.'); })}>Desativar importador</button><p className="text-xs text-slate-500">A liberação e a ativação são controladas pelo administrador.</p></div>}
    </div>}
    {config && <div className="aladay-panel aladay-keyboard scroll-mt-32 space-y-5">
      <div><h3 className="font-semibold">Importador de cardápio</h3><p className="mt-1 text-sm text-slate-600">CSV e XLSX são extraídos sem serviço pago. PDF e imagens podem ser transcritos manualmente ou enviados à extração opcional por IA quando configurada. A importação tradicional de planilhas continua na aba Cardápio.</p></div>
      {!available && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">O importador está desativado ou aguardando liberação.</p>}
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm font-medium flex-1 basis-48 min-w-0">Arquivo de origem (até 650 KB)<input className={`${inputClass} mt-1`} type="file" accept=".csv,.xlsx,.pdf,.png,.jpg,.jpeg,.webp" disabled={!available || Boolean(busy)} onChange={e => { void upload(e.target.files?.[0]); e.target.value = ''; }} /></label>
        <button className={buttonClass} type="button" disabled={!available || Boolean(busy)} onClick={() => action('Criando rascunho', async () => { acceptResult(await request<Result>('/menu-imports', 'POST', { categories: [], products: [] })); setSource(null); })}>Rascunho manual</button>
      </div>
      <div className="flex flex-wrap items-end gap-3"><label className="text-sm flex-1 basis-48 min-w-0">Retomar importação pelo identificador<input className={`${inputClass} mt-1`} value={resumeId} onChange={e => setResumeId(e.target.value)} /></label><button type="button" className={buttonClass} disabled={!available || Boolean(busy) || !resumeId.trim() || dirty} onClick={() => action('Carregando rascunho', async () => { const next = await request<Result>(`/menu-imports/${encodeURIComponent(resumeId.trim())}`); if (next.job.id !== result?.job.id) setSource(null); acceptResult(next); })}>Carregar / atualizar prévia</button></div>
      {result && draft && <>
        <div className="flex flex-wrap gap-2 break-all text-xs"><span className="rounded-full bg-slate-100 px-3 py-1">ID: {result.job.id}</span><span className="rounded-full bg-slate-100 px-3 py-1">{published ? 'Publicado' : 'Rascunho'} · versão {result.job.version}</span>{dirty && <span className="rounded-full bg-amber-100 px-3 py-1">Alterações ainda não salvas</span>}</div>
        {result.job.warnings?.length ? <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900">{result.job.warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul> : null}
        {!published && source && (source.mime.startsWith('image/') || source.mime === 'application/pdf') && <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4"><h4 className="font-semibold text-sm">Extração opcional por IA</h4><p className="text-sm">Se o provedor estiver configurado, esta ação envia o arquivo original para processamento externo e reserva custo no orçamento mensal. Confira o conteúdo extraído antes de publicar. A revisão manual continua disponível.</p><label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={authorizeAi} disabled={Boolean(busy) || !available || dirty} onChange={e => setAuthorizeAi(e.target.checked)} />Autorizo o envio deste arquivo ao provedor externo e o uso do orçamento configurado.</label><button className={buttonClass} type="button" disabled={!authorizeAi || Boolean(busy) || !available || dirty} onClick={() => action('Extraindo candidatos com IA', async () => { await request(`/menu-imports/${encodeURIComponent(result.job.id)}/extract`, 'POST', { filename: source.name, mimeType: source.mime, contentBase64: source.contentBase64, version: result.job.version, authorizeExternalProcessing: true }); acceptResult(await request<Result>(`/menu-imports/${encodeURIComponent(result.job.id)}`)); setNotice('Extração concluída. Revise todos os candidatos e preços antes de publicar.'); })}>Solicitar extração por IA</button></div>}
        <div className="grid gap-5 xl:grid-cols-2">
          <div className="space-y-3"><h4 className="font-semibold text-sm">Origem: {result.job.filename || 'Rascunho manual'}</h4>{source ? <>{source.mime.startsWith('image/') ? <img className="max-h-[600px] w-full object-contain rounded-lg border" src={source.url} alt={`Cardápio original: ${source.name}`} /> : source.mime === 'application/pdf' ? <iframe className="h-[500px] w-full rounded-lg border" title="PDF original do cardápio" src={source.url} /> : <p className="text-sm text-slate-600">Arquivo: {source.name}. Compare os candidatos com sua planilha original.</p>}<a className="text-sm text-blue-700 underline" href={source.url} download={source.name}>Baixar arquivo de origem</a></> : <p className="text-sm text-slate-600">O arquivo original não fica disponível ao retomar uma sessão. Consulte sua cópia local para revisar os candidatos.</p>}</div>
          <div className="space-y-4"><h4 className="font-semibold text-sm">Candidatos para revisão humana</h4><div className="space-y-2">{draft.categories.map((category, i) => <div className="flex items-center gap-2" key={category.id}><label className="text-xs flex-1">Categoria {i + 1}<input className={inputClass} value={category.name} disabled={!editable} onChange={e => edit({ ...draft, categories: draft.categories.map(c => c.id === category.id ? { ...c, name: e.target.value } : c) })} /></label><button type="button" aria-label={`Remover categoria ${category.name || i + 1}`} className={buttonClass} disabled={!editable || draft.products.some(p => p.categoryId === category.id)} onClick={() => edit({ ...draft, categories: draft.categories.filter(c => c.id !== category.id) })}>Remover</button></div>)}<button type="button" className={buttonClass} disabled={!editable} onClick={() => edit({ ...draft, categories: [...draft.categories, { id: `category_${crypto.randomUUID()}`, name: '', order: draft.categories.length }] })}>Adicionar categoria</button></div>
          {draft.products.map((product, i) => <fieldset key={product.id} disabled={!editable} className="space-y-3 rounded-xl border border-slate-200 p-3"><legend className="px-1 text-xs font-semibold">Produto {i + 1}</legend><label className="block text-xs">Nome<input className={inputClass} value={product.name} onChange={e => editProduct(product.id, { name: e.target.value })} /></label><label className="block text-xs">Descrição<textarea className={inputClass} value={product.description} onChange={e => editProduct(product.id, { description: e.target.value })} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs">Categoria<select className={inputClass} value={product.categoryId} onChange={e => editProduct(product.id, { categoryId: e.target.value })}><option value="">Selecione</option>{draft.categories.map(c => <option key={c.id} value={c.id}>{c.name || 'Sem nome'}</option>)}</select></label><label className="block text-xs">Preço (R$){product.priceCents === null && <span className="text-amber-800"> · incerto, conferir</span>}<input className={inputClass} type="number" min="0" step="0.01" value={product.priceCents === null ? '' : product.priceCents / 100} onChange={e => editProduct(product.id, { priceCents: e.target.value === '' ? null : Math.round(Number(e.target.value) * 100) })} /></label></div><div className="flex items-center justify-between"><label className="text-xs flex items-center gap-2"><input type="checkbox" checked={product.isAvailable} onChange={e => editProduct(product.id, { isAvailable: e.target.checked })} />Disponível</label><button className={buttonClass} type="button" onClick={() => edit({ ...draft, products: draft.products.filter(p => p.id !== product.id) })}>Remover produto</button></div></fieldset>)}
          <button type="button" className={buttonClass} disabled={!editable} onClick={() => edit({ ...draft, products: [...draft.products, { id: `product_${crypto.randomUUID()}`, name: '', description: '', categoryId: draft.categories[0]?.id || '', priceCents: null, isAvailable: true }] })}>Adicionar produto</button>
          </div>
        </div>
        {result.diff && <div className="rounded-lg bg-slate-50 p-4 space-y-2"><h4 className="font-semibold text-sm">Diferenças em relação ao catálogo atual</h4><p className="text-sm">{result.diff.categoriesAdded.length} categorias novas · {result.diff.categoriesUpdated.length} categorias atualizadas · {result.diff.productsAdded.length} produtos novos · {result.diff.productsUpdated.length} produtos atualizados · {duplicates} duplicidades</p>{dirty && <p className="text-xs text-amber-800">Salve a revisão para recalcular as diferenças antes de confirmar.</p>}<details className="text-xs"><summary className="cursor-pointer">Ver detalhes das diferenças</summary><div className="mt-2 max-h-64 space-y-3 overflow-auto">{([["Categorias novas", result.diff.categoriesAdded], ["Categorias atualizadas", result.diff.categoriesUpdated], ["Produtos novos", result.diff.productsAdded], ["Produtos atualizados", result.diff.productsUpdated], ["Duplicidades", result.diff.duplicates]] as Array<[string, unknown[]]>).map(([label, rows]) => <div key={label}><h5 className="font-semibold">{label}</h5>{rows.length ? <ul className="list-disc pl-5">{rows.map((row, index) => { const item = row as { name?: string; priceCents?: number | null }; return <li key={index}>{item.name || "Sem nome"}{typeof item.priceCents === "number" ? ` · ${(item.priceCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""}</li>; })}</ul> : <p className="text-slate-500">Nenhum</p>}</div>)}</div></details></div>}
        {!published && <div className="space-y-3 border-t border-slate-200 pt-4"><button type="button" className={buttonClass} disabled={!available || Boolean(busy) || !dirty} onClick={() => action('Salvando revisão', async () => { acceptResult(await request<Result>(`/menu-imports/${encodeURIComponent(result.job.id)}/candidates`, 'PATCH', { version: result.job.version, candidates: draft })); setNotice('Revisão salva e diferenças recalculadas.'); })}>Salvar revisão e recalcular diferenças</button>{invalid && <p className="text-sm text-amber-900">Preencha os nomes, selecione as categorias e confira todos os preços. É necessário ao menos um produto.</p>}<label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirm} disabled={dirty || invalid || !available || Boolean(busy)} onChange={e => setConfirm(e.target.checked)} />Revisei o arquivo original, os candidatos e as diferenças. Confirmo a publicação no catálogo deste restaurante.</label>{duplicates > 0 && <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={confirmDuplicates} disabled={dirty || !available || Boolean(busy)} onChange={e => setConfirmDuplicates(e.target.checked)} />Revisei e aceito as duplicidades identificadas.</label>}<button type="button" className="rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed" disabled={!available || Boolean(busy) || dirty || invalid || !confirm || (duplicates > 0 && !confirmDuplicates)} onClick={() => action('Publicando catálogo', async () => { const data = await request<{ job: Job }>(`/menu-imports/${encodeURIComponent(result.job.id)}/publish`, 'POST', { version: result.job.version, catalogHash: result.catalogHash, diffHash: result.diffHash, confirm: true, confirmDuplicates }); setResult({ ...result, job: data.job }); setConfirm(false); window.dispatchEvent(new Event('aladay-catalog-published')); setNotice('Cardápio publicado com sucesso. Catálogo atualizado.'); })}>Publicar cardápio revisado</button></div>}
      </>}
    </div>}
  </section>;
}

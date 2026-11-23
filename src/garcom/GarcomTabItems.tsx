import { StatusNotice } from '../components/StatusNotice';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { OptionGroup, OrderItemOption, OrderStatus, Product } from '../types';

type OptionSelection = Pick<OrderItemOption, 'groupId' | 'itemId'>;
type MenuProduct = Pick<Product, 'id' | 'name' | 'priceCents' | 'optionGroups'>;

interface TabItem {
  id: string;
  productName: string;
  quantity: number;
  totalCents: number;
  notes?: string | null;
  selectedOptions: OrderItemOption[];
  orderId?: string | null;
  orderStatus?: OrderStatus | null;
}

interface TabDetail {
  id: string;
  status: string;
  version: number;
  items: TabItem[];
  totalCents: number;
}

type OperationKey = { expectedVersion: number; idempotencyKey: string };
export type PendingTabOperation =
  | { endpoint: 'items'; body: OperationKey & { productId: string; quantity: number; notes: string; selectedOptions: OptionSelection[] } }
  | { endpoint: 'submit'; body: OperationKey };

interface Props {
  tabId: string;
  basePath: string;
  token: string;
  canEdit: boolean;
  online: boolean;
  floorVersion: number;
  pendingOperations: Map<string, PendingTabOperation>;
}

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const money = (cents: number) => currency.format(cents / 100);
const orderStatuses: Record<OrderStatus, string> = {
  received: 'Recebido pela cozinha',
  confirmed: 'Confirmado',
  preparing: 'Em preparo',
  ready: 'Pronto para servir',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

function maxSelections(group: OptionGroup) {
  return group.maxSelections || group.items.length || 1;
}

function minSelections(group: OptionGroup) {
  return Math.max(group.minSelections || 0, group.required ? 1 : 0);
}

export function GarcomTabItems({ tabId, basePath, token, canEdit, online, floorVersion, pendingOperations }: Props) {
  const tabPath = `${basePath}/tabs/${encodeURIComponent(tabId)}`;
  const [tab, setTab] = useState<TabDetail>();
  const [products, setProducts] = useState<MenuProduct[]>([]);
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [notes, setNotes] = useState('');
  const [selectedOptions, setSelectedOptions] = useState<OptionSelection[]>([]);
  const [pending, setPending] = useState(() => pendingOperations.get(tabId));
  const [loading, setLoading] = useState(true);
  const [catalogLoading, setCatalogLoading] = useState(canEdit);
  const [readError, setReadError] = useState('');
  const [catalogError, setCatalogError] = useState('');
  const [actionError, setActionError] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const reads = useRef<AbortController | undefined>(undefined);
  const writing = useRef<AbortController | undefined>(undefined);

  const loadTab = useCallback(async () => {
    if (!navigator.onLine) return;
    reads.current?.abort();
    const controller = new AbortController();
    reads.current = controller;
    setLoading(true);
    setReadError('');
    try {
      const response = await fetch(tabPath, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if ([401, 403, 404].includes(response.status)) setTab(undefined);
      if (!response.ok) throw new Error('Leitura não confirmada');
      const result: { data: TabDetail } = await response.json();
      if (controller.signal.aborted) return;
      if (result.data?.id !== tabId || !Array.isArray(result.data.items)) throw new Error('Resposta de comanda inválida');
      setTab(result.data);
    } catch {
      if (!controller.signal.aborted) setReadError('Não foi possível atualizar a comanda. Atualize o salão e tente novamente.');
    } finally {
      if (reads.current === controller) {
        reads.current = undefined;
        setLoading(false);
      }
    }
  }, [tabId, tabPath, token]);

  useEffect(() => {
    if (online) void loadTab();
    return () => { reads.current?.abort(); reads.current = undefined; };
  }, [floorVersion, loadTab, online]);

  useEffect(() => {
    if (!online || !canEdit) return;
    const controller = new AbortController();
    setCatalogLoading(true);
    setCatalogError('');
    void (async () => {
      try {
        const response = await fetch(`${basePath}/catalog`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Catálogo não carregado');
        const result: { data: { products: MenuProduct[] } } = await response.json();
        if (controller.signal.aborted) return;
        if (!Array.isArray(result.data?.products)) throw new Error('Catálogo inválido');
        setProducts(result.data.products);
      } catch {
        if (!controller.signal.aborted) setCatalogError('Não foi possível carregar os produtos. Atualize o salão para tentar novamente.');
      } finally {
        if (!controller.signal.aborted) setCatalogLoading(false);
      }
    })();
    return () => controller.abort();
  }, [basePath, canEdit, floorVersion, online, token]);

  useEffect(() => {
    setSending(false);
    return () => { writing.current?.abort(); writing.current = undefined; };
  }, [tabPath, token]);

  const product = products.find(item => item.id === productId);
  const groupOptions = product?.optionGroups ?? [];
  const itemQuantity = Number(quantity);
  const validQuantity = Number.isInteger(itemQuantity) && itemQuantity >= 1 && itemQuantity <= 99;
  const configured = groupOptions.every(group => {
    const count = selectedOptions.filter(option => option.groupId === group.id && group.items.some(item => item.id === option.itemId)).length;
    return count >= minSelections(group) && count <= maxSelections(group);
  });
  const itemUnitCents = (product?.priceCents ?? 0) + selectedOptions.reduce((sum, option) => (
    sum + (groupOptions.find(group => group.id === option.groupId)?.items.find(item => item.id === option.itemId)?.priceCents ?? 0)
  ), 0);
  const tabReady = canEdit && online && !loading && !readError && !sending && tab?.status === 'open';
  const unsubmittedCount = tab?.items.filter(item => !item.orderId).length ?? 0;

  function toggleOption(group: OptionGroup, itemId: string, checked: boolean) {
    setSelectedOptions(previous => {
      if (!checked) return previous.filter(option => option.groupId !== group.id || option.itemId !== itemId);
      const unrelated = maxSelections(group) === 1 ? previous.filter(option => option.groupId !== group.id) : previous;
      return [...unrelated, { groupId: group.id, itemId }];
    });
  }

  function clearProduct() {
    setProductId('');
    setQuantity('1');
    setNotes('');
    setSelectedOptions([]);
  }

  async function send(operation: PendingTabOperation) {
    if (!canEdit || !navigator.onLine || writing.current) return;
    const controller = new AbortController();
    writing.current = controller;
    pendingOperations.set(tabId, operation);
    setPending(operation);
    setSending(true);
    setMessage('');
    setActionError('');
    try {
      const response = await fetch(`${tabPath}/${operation.endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(operation.body),
        cache: 'no-store',
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (response.status === 409 || response.status === 400) {
        pendingOperations.delete(tabId);
        setPending(undefined);
        setActionError(response.status === 409
          ? 'A comanda mudou. Confira os itens atualizados antes de tentar novamente.'
          : 'Não foi possível executar a solicitação. Confira a comanda e os dados do item.');
        await loadTab();
        return;
      }
      if ([401, 403, 404].includes(response.status)) {
        await loadTab();
        throw new Error('Acesso à comanda não confirmado');
      }
      if (!response.ok) throw new Error('Resposta não confirmada');
      if (operation.endpoint === 'submit') {
        const result: { data: { orderId: string } } = await response.json();
        if (controller.signal.aborted) return;
        if (typeof result.data?.orderId !== 'string') throw new Error('Envio não confirmado');
      }
      pendingOperations.delete(tabId);
      setPending(undefined);
      if (operation.endpoint === 'items') clearProduct();
      setMessage(operation.endpoint === 'items' ? 'Item adicionado à comanda.' : 'Envio à cozinha confirmado.');
      await loadTab();
    } catch {
      if (!controller.signal.aborted) setActionError('O servidor não confirmou a resposta. Tente confirmar a mesma operação quando a conexão estiver disponível.');
    } finally {
      if (writing.current === controller) {
        writing.current = undefined;
        setSending(false);
      }
    }
  }

  function addItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tabReady || !tab || !product || !configured || !validQuantity || catalogLoading || catalogError ||
        pendingOperations.has(tabId)) return;
    void send({
      endpoint: 'items',
      body: {
        productId: product.id, quantity: itemQuantity, notes: notes.trim(), selectedOptions,
        expectedVersion: tab.version, idempotencyKey: crypto.randomUUID(),
      },
    });
  }

  function submitItems() {
    if (!tabReady || !tab || !unsubmittedCount || pendingOperations.has(tabId)) return;
    void send({ endpoint: 'submit', body: { expectedVersion: tab.version, idempotencyKey: crypto.randomUUID() } });
  }

  return (
    <div className="garcom-items">
      {loading && online && <p className="garcom-muted" role="status">Atualizando comanda…</p>}
      {readError && <StatusNotice tone="error">{readError}</StatusNotice>}
      {actionError && <StatusNotice tone="error">{actionError}</StatusNotice>}
      {message && <StatusNotice tone="success">{message}</StatusNotice>}
      {pending && canEdit && (
        <div className="garcom-pending">
          <p>{sending ? 'Aguardando confirmação do servidor…' : 'Há uma solicitação com confirmação pendente.'}</p>
          {!sending && <button type="button" className="garcom-button" disabled={!online || loading || !tab || !!readError} onClick={() => void send(pending)}>Confirmar solicitação pendente</button>}
        </div>
      )}
      {tab && (
        <>
          <h3>Itens da comanda</h3>
          {tab.items.length ? (
            <ul className="garcom-item-list">
              {tab.items.map(item => (
                <li key={item.id}>
                  <div><strong>{item.quantity} × {item.productName}</strong><span>{money(item.totalCents)}</span></div>
                  {item.selectedOptions?.length > 0 && <p>{item.selectedOptions.map(option => option.itemName).join(', ')}</p>}
                  {item.notes && <p>{item.notes}</p>}
                  <p>{item.orderId ? (item.orderStatus ? orderStatuses[item.orderStatus] : 'Enviado à cozinha') : 'A enviar à cozinha'}</p>
                </li>
              ))}
            </ul>
          ) : <p className="garcom-muted">Nenhum item lançado.</p>}
          <p className="garcom-tab-total"><strong>Total</strong><strong>{money(tab.totalCents)}</strong></p>
          {canEdit && unsubmittedCount > 0 && (
            <button type="button" className="garcom-button garcom-primary" disabled={!tabReady || !!pending} onClick={submitItems}>Enviar à cozinha</button>
          )}
          {canEdit && tab.status === 'open' && (
            <form className="garcom-product-form" onSubmit={addItem}>
              <h3>Adicionar item</h3>
              {catalogLoading && online && <p className="garcom-muted" role="status">Carregando produtos…</p>}
              {catalogError && <StatusNotice tone="error">{catalogError}</StatusNotice>}
              {!catalogLoading && !catalogError && !products.length && <p className="garcom-muted">Nenhum produto disponível.</p>}
              {!!products.length && (
                <fieldset disabled={!tabReady || !!pending || catalogLoading || !!catalogError}>
                  <label>Produto
                    <select className="aladay-field" value={productId} onChange={event => { setProductId(event.target.value); setSelectedOptions([]); }} required>
                      <option value="">Selecione um produto</option>
                      {products.map(item => <option key={item.id} value={item.id}>{item.name} · {money(item.priceCents)}</option>)}
                    </select>
                  </label>
                  {product && (
                    <>
                      <label>Quantidade<input className="aladay-field" type="number" min="1" max="99" inputMode="numeric" value={quantity} onChange={event => setQuantity(event.target.value)} required /></label>
                      {groupOptions.map(group => {
                        const groupCount = selectedOptions.filter(option => option.groupId === group.id).length;
                        return (
                          <fieldset className="garcom-options" key={group.id}>
                            <legend>{group.name}</legend>
                            <p className="garcom-muted">Escolha de {minSelections(group)} a {maxSelections(group)}.</p>
                            {group.items.map(item => {
                              const checked = selectedOptions.some(option => option.groupId === group.id && option.itemId === item.id);
                              return (
                                <label key={item.id}>
                                  <input type="checkbox" checked={checked}
                                    disabled={!checked && maxSelections(group) > 1 && groupCount >= maxSelections(group)}
                                    onChange={event => toggleOption(group, item.id, event.target.checked)} />
                                  {item.name}{item.priceCents !== 0 && ` · ${money(item.priceCents)}`}
                                </label>
                              );
                            })}
                          </fieldset>
                        );
                      })}
                      <label>Observações<textarea className="aladay-field" rows={2} value={notes} maxLength={300} onChange={event => setNotes(event.target.value)} /></label>
                      {validQuantity && <p className="garcom-muted">Valor estimado do item {money(itemUnitCents * itemQuantity)}</p>}
                      <button type="submit" className="garcom-button" disabled={!validQuantity || !configured}>Adicionar à comanda</button>
                    </>
                  )}
                </fieldset>
              )}
            </form>
          )}
        </>
      )}
    </div>
  );
}

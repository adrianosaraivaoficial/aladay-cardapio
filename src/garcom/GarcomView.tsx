import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronRight, CircleAlert, ClipboardList, RefreshCw, Utensils, WifiOff } from 'lucide-react';
import type { AuthSession } from '../types';
import { GarcomTabItems, type PendingTabOperation } from './GarcomTabItems';
import './garcom.css';

type GarcomRole = 'owner' | 'waiter' | 'manager' | 'kitchen' | 'cashier';

interface Tab {
  id: string;
  tableNumber: number;
  status: string;
  version: number;
  openedAt: string;
}

interface Table {
  number: number;
  tab: Tab | null;
}

interface Floor {
  role: GarcomRole;
  tables: Table[];
}

const rolesAllowedToOpen = new Set<GarcomRole>(['owner', 'waiter', 'manager']);
const openedAtFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function formatOpenedAt(date: string) {
  const timestamp = Date.parse(date);
  return Number.isNaN(timestamp) ? '—' : openedAtFormat.format(timestamp);
}

function GarcomFloor({ authSession }: { authSession: AuthSession }) {
  const { token, user } = authSession;
  const basePath = `/api/v1/tenants/${encodeURIComponent(user.tenantSlug)}/garcom`;
  const [floor, setFloor] = useState<Floor>();
  const [floorVersion, setFloorVersion] = useState(0);
  const [selectedNumber, setSelectedNumber] = useState<number>();
  const [online, setOnline] = useState(() => navigator.onLine);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState<number>();
  const [readError, setReadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [feedback, setFeedback] = useState('');
  const request = useRef<AbortController | undefined>(undefined);
  const submit = useRef<AbortController | undefined>(undefined);
  const keys = useRef(new Map<number, string>());
  const pendingOperations = useRef(new Map<string, PendingTabOperation>());
  const detailsHeading = useRef<HTMLHeadingElement>(null);

  const refresh = useCallback(async () => {
    if (!navigator.onLine) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setReadError('');
    try {
      const response = await fetch(`${basePath}/tables`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if ([401, 403, 404].includes(response.status)) {
        setFloor(undefined);
        setSelectedNumber(undefined);
        setActionError('');
        setFeedback('');
        setReadError(response.status === 401
          ? 'Sua sessão expirou. Entre novamente para acessar o salão.'
          : 'O salão não está disponível para esta conta ou restaurante.');
        return;
      }
      if (!response.ok) throw new Error('Não foi possível atualizar as mesas. Tente novamente.');
      const result: { data: Floor } = await response.json();
      if (controller.signal.aborted) return;
      if (!Array.isArray(result.data?.tables)) throw new Error('Resposta de mesas inválida');
      setFloor(result.data);
      setFloorVersion(version => version + 1);
    } catch {
      if (!controller.signal.aborted) setReadError('Não foi possível atualizar as mesas. Tente novamente.');
    } finally {
      if (request.current === controller) {
        request.current = undefined;
        setLoading(false);
      }
    }
  }, [basePath, token]);

  useEffect(() => {
    function connectionChanged() {
      setOnline(navigator.onLine);
      if (navigator.onLine) void refresh();
      else request.current?.abort();
    }
    window.addEventListener('online', connectionChanged);
    window.addEventListener('offline', connectionChanged);
    setOpening(undefined);
    connectionChanged();
    return () => {
      window.removeEventListener('online', connectionChanged);
      window.removeEventListener('offline', connectionChanged);
      request.current?.abort();
      request.current = undefined;
      submit.current?.abort();
      submit.current = undefined;
    };
  }, [refresh]);

  const selected = floor?.tables.find(table => table.number === selectedNumber);
  const occupied = floor?.tables.filter(table => table.tab).length ?? 0;
  const canOpen = !!floor && rolesAllowedToOpen.has(floor.role);

  function viewTable(number: number) {
    setSelectedNumber(number);
    setActionError('');
    setFeedback('');
    requestAnimationFrame(() => detailsHeading.current?.focus());
  }

  async function openTab(table: Table) {
    if (table.tab || !canOpen || loading || readError || !navigator.onLine || submit.current) return;
    const controller = new AbortController();
    submit.current = controller;
    setOpening(table.number);
    setActionError('');
    setFeedback('');
    try {
      const idempotencyKey = keys.current.get(table.number) ?? crypto.randomUUID();
      keys.current.set(table.number, idempotencyKey);
      const response = await fetch(`${basePath}/tabs`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableNumber: table.number, idempotencyKey }),
        cache: 'no-store',
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (response.status === 409) {
        keys.current.delete(table.number);
        setActionError(`A mesa ${table.number} mudou em outro dispositivo. Confira a comanda atual.`);
        await refresh();
        return;
      }
      if ([401, 403, 404].includes(response.status)) {
        keys.current.delete(table.number);
        await refresh();
        return;
      }
      if (!response.ok) throw new Error('Abertura não confirmada');
      const result: { data: Tab } = await response.json();
      if (controller.signal.aborted) return;
      if (result.data?.tableNumber !== table.number) throw new Error('Resposta de abertura inválida');
      keys.current.delete(table.number);
      if (result.data.status !== 'open') {
        setActionError(`A comanda da mesa ${table.number} já foi encerrada. Confira a situação atual da mesa.`);
        await refresh();
        return;
      }
      setFloor(previous => previous && ({
        ...previous,
        tables: previous.tables.map(item => item.number === table.number ? { ...item, tab: result.data } : item),
      }));
      setFeedback(`Comanda da mesa ${table.number} aberta.`);
      await refresh();
    } catch {
      if (!controller.signal.aborted) setActionError('Não foi possível confirmar a abertura. Tente novamente quando estiver conectado.');
    } finally {
      if (submit.current === controller) {
        submit.current = undefined;
        setOpening(undefined);
      }
    }
  }

  return (
    <section className="garcom" aria-labelledby="garcom-title">
      <header className="garcom-header">
        <div>
          <p className="garcom-tenant"><Utensils size={16} aria-hidden="true" /> {user.tenantName || user.tenantSlug}</p>
          <h1 id="garcom-title">Aladay Garçom</h1>
        </div>
        <button type="button" className="garcom-button" disabled={!online || loading || opening !== undefined} onClick={() => void refresh()}>
          <RefreshCw size={17} aria-hidden="true" /> Atualizar
        </button>
      </header>
      {!online && (
        <p className="garcom-notice" role="status">
          <WifiOff size={18} aria-hidden="true" /> Sem conexão. As mesas serão atualizadas ao reconectar.
        </p>
      )}
      {loading && <p className="garcom-progress" role="status">{floor ? 'Atualizando mesas…' : 'Carregando mesas…'}</p>}
      {readError && <p className="garcom-notice" role="alert"><CircleAlert size={18} aria-hidden="true" /> {readError}</p>}
      {floor && (
        <>
          <dl className="garcom-stats">
            <div><dt>Livres</dt><dd>{floor.tables.length - occupied}</dd></div>
            <div><dt>Ocupadas</dt><dd>{occupied}</dd></div>
          </dl>
          <div className="garcom-layout">
            <section aria-labelledby="garcom-tables-title">
              <h2 id="garcom-tables-title">Mesas do salão</h2>
              {floor.tables.length ? (
                <ul className="garcom-tables">
                  {floor.tables.map(table => (
                    <li key={table.number}>
                      <button type="button" className="garcom-table" aria-pressed={selectedNumber === table.number} disabled={opening !== undefined} onClick={() => viewTable(table.number)}>
                        <span>
                          <strong>Mesa {table.number}</strong>
                          <small className={table.tab ? 'garcom-occupied' : 'garcom-free'}>{table.tab ? 'Ocupada' : 'Livre'}</small>
                        </span>
                        <ChevronRight size={18} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : <p className="garcom-muted">Nenhuma mesa configurada para este restaurante.</p>}
            </section>
            {selected && (
              <section className="garcom-detail" aria-labelledby="garcom-table-title">
                <h2 ref={detailsHeading} id="garcom-table-title" tabIndex={-1}>
                  <ClipboardList size={20} aria-hidden="true" /> Mesa {selected.number}
                </h2>
                {actionError && <p className="garcom-notice" role="alert"><CircleAlert size={18} aria-hidden="true" /> {actionError}</p>}
                {feedback && <p className="garcom-notice garcom-success" role="status">{feedback}</p>}
                {selected.tab ? (
                  <>
                    <dl className="garcom-tab-detail">
                      <div><dt>Comanda</dt><dd>{selected.tab.id}</dd></div>
                      <div><dt>Abertura</dt><dd><time dateTime={selected.tab.openedAt}>{formatOpenedAt(selected.tab.openedAt)}</time></dd></div>
                    </dl>
                    <GarcomTabItems key={selected.tab.id} tabId={selected.tab.id} basePath={basePath} token={token}
                      canEdit={canOpen} online={online} floorVersion={floorVersion} pendingOperations={pendingOperations.current} />
                  </>
                ) : (
                  <>
                    <p className="garcom-muted">Mesa livre.</p>
                    {canOpen && (
                      <button
                        type="button"
                        className="garcom-button garcom-primary"
                        disabled={!online || loading || !!readError || opening !== undefined}
                        onClick={() => void openTab(selected)}
                      >
                        {opening === selected.number ? 'Abrindo comanda…' : 'Abrir comanda'}
                      </button>
                    )}
                  </>
                )}
              </section>
            )}
          </div>
        </>
      )}
    </section>
  );
}

export function GarcomView({ authSession }: { authSession: AuthSession }) {
  const { id, tenantSlug } = authSession.user;
  if (!tenantSlug || tenantSlug === '*') {
    return (
      <section className="garcom" aria-labelledby="garcom-title">
        <h1 id="garcom-title">Aladay Garçom</h1>
        <p className="garcom-notice" role="alert">Entre com uma conta vinculada ao restaurante para acessar o salão.</p>
      </section>
    );
  }
  return <GarcomFloor key={`${id}:${tenantSlug}`} authSession={authSession} />;
}

export default GarcomView;

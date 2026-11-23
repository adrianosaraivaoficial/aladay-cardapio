import { useEffect, useState } from 'react';
import { AuthPortalView } from '../components/AuthPortalView';
import { StatusNotice } from '../components/StatusNotice';
import type { AuthSession } from '../types';
import { GarcomView } from './GarcomView';

const key = 'aladay_garcom_session';
const scope = '/app/garcom/';

function readSession(): AuthSession | null {
  try {
    const saved = sessionStorage.getItem(key);
    return saved ? JSON.parse(saved) : null;
  } catch { return null; }
}

export default function GarcomApp() {
  const [session, setSession] = useState(readSession);
  const [logoutError, setLogoutError] = useState('');
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    document.title = 'Aladay Garçom';
    const manifest = document.createElement('link');
    manifest.rel = 'manifest';
    manifest.href = scope + 'manifest.webmanifest';
    document.head.append(manifest);
    if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register(scope + 'sw.js', { scope }).catch(() => {});
    }
    return () => manifest.remove();
  }, []);

  function authenticate(value: AuthSession) {
    setSession(value);
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* Session remains available in this view. */ }
  }

  async function logout() {
    if (!session || signingOut) return;
    setSigningOut(true);
    setLogoutError('');
    try {
      const response = await fetch('/api/v1/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + session.token } });
      if (!response.ok && response.status !== 401) throw new Error('Falha ao revogar sessão');
      try { sessionStorage.removeItem(key); } catch { /* Storage may be disabled. */ }
      setSession(null);
    } catch {
      setLogoutError('Não foi possível encerrar a sessão. Confira a conexão e tente novamente.');
    } finally { setSigningOut(false); }
  }

  const allowed = session?.user.role === 'TENANT_OWNER' || session?.user.role === 'GARCOM_STAFF';
  return <div className="min-h-dvh bg-slate-50 text-slate-950">
    <header className="border-b border-aladay-line bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2 font-extrabold"><span aria-hidden="true" className="rounded-lg bg-aladay-brand px-2 py-1 text-white">A</span> Aladay Garçom</div>
        {session && <button className="aladay-action aladay-action-secondary" type="button" disabled={signingOut} onClick={() => void logout()}>{signingOut ? 'Saindo…' : 'Sair'}</button>}
      </div>
    </header>
    {logoutError && <div className="mx-auto max-w-5xl px-4 pt-4"><StatusNotice tone="error">{logoutError}</StatusNotice></div>}
    {session && allowed ? <main><GarcomView key={session.user.id} authSession={session} /></main> :
      <main className="mx-auto max-w-2xl p-4 sm:p-8">
        {session ? <StatusNotice tone="error">Use uma conta autorizada no Aladay Garçom.</StatusNotice> :
          <AuthPortalView currentSession={null} onSessionAuthenticated={authenticate} onNavigateToAdmin={() => {}} />}
      </main>}
  </div>;
}

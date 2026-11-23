import { Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

const waiterPath = /^\/app\/garcom\/?$/;
const Page = waiterPath.test(location.pathname) ? lazy(() => import('./garcom/GarcomApp')) : lazy(() => import('./App'));
if (location.pathname === '/app/garcom') {
  location.replace('/app/garcom/' + location.search + location.hash);
} else {
  createRoot(document.getElementById('root')!).render(
    <Suspense fallback={<p className="p-4" role="status">Carregando Aladay…</p>}><Page /></Suspense>,
  );
}

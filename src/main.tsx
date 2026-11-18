import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {installSessionFetch} from './utils/sessionFetch';
import './index.css';

installSessionFetch();
createRoot(document.getElementById('root')!).render(<App />);

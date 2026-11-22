import { useSyncExternalStore } from 'react';
import { emptySession, type DemoSession } from './orders';

const key = 'aladay:demo:session:v1';
const listeners = new Set<() => void>();
let current = emptySession();
let storage: Storage | undefined;
try {
  // Shared only when changes can be serialized across tabs.
  storage = navigator.locks ? window.localStorage : window.sessionStorage;
  storage.getItem(key);
} catch {
  storage = undefined;
}

function read() {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) as DemoSession : undefined;
  } catch {
    return undefined;
  }
}

current = read() ?? current;
function publish(session: DemoSession) {
  current = session;
  for (const listener of listeners) listener();
}

window.addEventListener('storage', event => {
  if (event.storageArea === storage && (event.key === key || event.key === null)) {
    publish(read() ?? emptySession());
  }
});

export function mutateSession(change: (session: DemoSession) => DemoSession) {
  const apply = () => {
    const session = change(read() ?? current);
    storage?.setItem(key, JSON.stringify(session));
    publish(session);
    return session;
  };
  return navigator.locks && storage === window.localStorage
    ? navigator.locks.request(key, apply)
    : Promise.resolve().then(apply);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useDemoSession() {
  return useSyncExternalStore(subscribe, () => current);
}

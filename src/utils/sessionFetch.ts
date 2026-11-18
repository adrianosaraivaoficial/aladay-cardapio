let csrfToken = '';

// Keep legacy Bearer requests working while new browser sessions use an HttpOnly cookie.
export function installSessionFetch() {
  const nativeFetch = window.fetch.bind(window);
  const wrappedFetch: typeof fetch = async (input, init) => {
    const address = input instanceof Request ? input.url : String(input);
    const url = new URL(address, window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/v1/'))
      return nativeFetch(input, init);

    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    const bearer = headers.get('Authorization');
    if (bearer && /^Bearer\s*$/i.test(bearer)) headers.delete('Authorization');
    const cookieSessionEndpoint = [
      '/api/v1/auth/login',
      '/api/v1/auth/session',
      '/api/v1/auth/whatsapp-otp/verify',
    ].includes(url.pathname);
    if (cookieSessionEndpoint) headers.set('X-Aladay-Session-Mode', 'cookie');
    const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method) && csrfToken && !headers.has('Authorization') && !headers.has('X-CSRF-Token'))
      headers.set('X-CSRF-Token', csrfToken);

    const response = await nativeFetch(input, { ...init, headers, credentials: 'same-origin' });
    if (cookieSessionEndpoint && response.ok) {
      const payload = await response.clone().json().catch(() => null);
      if (typeof payload?.csrfToken === 'string') csrfToken = payload.csrfToken;
    }
    if (url.pathname === '/api/v1/auth/logout' && response.ok) csrfToken = '';
    return response;
  };
  window.fetch = wrappedFetch;
}

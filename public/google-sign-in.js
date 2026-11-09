import { t, onLanguageChange } from './i18n.js';

const GOOGLE_HINT_KEY = 'joulesGoogleHint';

export function initGoogleSignIn({ onSuccess, bootCode, bootError, bootHandoff }) {
  const get = (id) => document.getElementById(`google-${id}`);
  const fallback = document.getElementById('email-auth');
  // Installed PWAs must use redirect mode: the popup relies on postMessage to
  // window.opener, which doesn't exist when the OS opens sign-in in a browser.
  const standalone = () => Boolean(window.matchMedia?.('(display-mode: standalone)').matches);
  let config = null;
  let preparing = null;
  let scriptPromise = null;
  let pendingAuth = null; // {credential} from the popup flow or {code} from a redirect round-trip
  let pendingExpiry = null;
  let submitting = false;
  let statusKey = 'auth.googleLoading';
  const status = (key) => {
    statusKey = key;
    get('status').textContent = t(key);
  };
  const clearPending = () => {
    clearTimeout(pendingExpiry);
    pendingAuth = null;
    get('link-form').reset();
    get('link-form').hidden = true;
  };
  const fail = (key) => {
    status(key);
    fallback.open = true;
    get('retry').hidden = false;
  };
  // An intent:// URL lets Android dispatch the link to the installed app
  // (plain https links just navigate inside the current browser).
  // handoff=1 marks round-trips back into a browser tab so we don't refire.
  const intentUrl = (code) =>
    `intent://${window.location.host}/?authCode=${encodeURIComponent(code)}&handoff=1#Intent;scheme=https;end`;
  const fireIntent = (url) => {
    // Hidden iframe navigation dispatches the intent where supported and
    // fails silently elsewhere (unlike assigning window.location).
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;
    document.body?.appendChild(iframe);
    setTimeout(() => iframe.remove(), 10000);
  };
  const showHandoff = (code) => {
    const handoff = get('handoff');
    const link = get('handoff-link');
    if (!handoff || !link || !window.location) return;
    link.href = intentUrl(code);
    handoff.hidden = false;
    if (!bootHandoff) fireIntent(intentUrl(code));
  };
  const exchange = async (auth, password) => {
    if (submitting) return;
    submitting = true;
    get('link-submit').disabled = true;
    const result = await fetch('/api/v1/auth/google', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...auth, ...(password ? { password } : {}) }),
    }).then(async (res) => ({ ok: res.ok, status: res.status, body: await res.json() })).catch(() => null);
    submitting = false;
    get('link-submit').disabled = false;
    if (result?.body.code === 'GOOGLE_LINK_REQUIRED') {
      clearPending();
      pendingAuth = result.body.linkCode ? { code: result.body.linkCode } : auth;
      pendingExpiry = setTimeout(() => { clearPending(); fail('auth.googleExpired'); }, 10 * 60 * 1000);
      get('link-email').textContent = result.body.email;
      get('link-form').hidden = false;
      status('auth.googleLinkRequired');
      get('link-password').focus();
      return;
    }
    if (!result?.ok || !result.body.accessToken) {
      fail(password && result?.status === 401 ? 'auth.googleLinkFailed' : 'auth.googleFailed');
      return;
    }
    clearPending();
    if (result.body.email) localStorage.setItem(GOOGLE_HINT_KEY, result.body.email);
    status('auth.googleReady');
    // A redirect sign-in finishes in the browser tab; carry the session into
    // the installed app via an intent link (separate storage on real WebAPKs).
    if (result.body.handoffCode && !standalone()) showHandoff(result.body.handoffCode);
    onSuccess(result.body);
  };
  const loadScript = () => {
    if (window.google?.accounts?.id) return Promise.resolve();
    if (scriptPromise) return scriptPromise;
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      const timeout = setTimeout(() => reject(new Error('Google script timed out')), 15000);
      script.onload = () => { clearTimeout(timeout); resolve(); };
      script.onerror = () => { clearTimeout(timeout); script.remove(); reject(new Error('Google script unavailable')); };
      document.head.appendChild(script);
    }).catch((error) => { scriptPromise = null; throw error; });
    return scriptPromise;
  };
  const renderButton = () => {
    if (!config?.enabled || !window.google?.accounts?.id) return;
    get('button').replaceChildren();
    window.google.accounts.id.initialize({
      client_id: config.clientId,
      nonce: config.nonce,
      // auto_select would trigger an immediate redirect loop in redirect mode.
      auto_select: !standalone(),
      ux_mode: standalone() ? 'redirect' : 'popup',
      login_uri: standalone() ? `${window.location.origin}/api/v1/auth/google/redirect` : undefined,
      login_hint: localStorage.getItem(GOOGLE_HINT_KEY) || undefined,
      callback: ({ credential }) => exchange({ credential }),
    });
    window.google.accounts.id.renderButton(get('button'), {
      theme: 'outline', size: 'large', text: 'continue_with', shape: 'rectangular',
      width: Math.max(200, Math.min(360, get('button').clientWidth)),
      locale: document.documentElement.lang,
    });
  };
  const refresh = () => {
    if (preparing) return preparing;
    clearPending();
    get('button').replaceChildren();
    get('retry').hidden = true;
    status('auth.googleLoading');
    preparing = fetch('/api/v1/auth/google/config', { cache: 'no-store', credentials: 'same-origin' })
      .then((res) => { if (!res.ok) throw new Error('Google configuration unavailable'); return res.json(); })
      .then(async (data) => {
        config = data;
        if (!config.enabled) { fail('auth.googleUnavailable'); return; }
        await loadScript();
        renderButton();
        status('auth.googleReady');
      })
      .catch(() => fail('auth.googleFailed'))
      .finally(() => { preparing = null; });
    return preparing;
  };
  get('link-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (pendingAuth && !submitting) exchange(pendingAuth, get('link-password').value);
  });
  get('retry').addEventListener('click', refresh);
  onLanguageChange(() => { status(statusKey); renderButton(); });
  refresh();
  if (bootCode) exchange({ code: bootCode });
  else if (bootError) fail('auth.googleFailed');
  return {
    refresh,
    clearPending,
    disableAutoSelect() { window.google?.accounts?.id?.disableAutoSelect?.(); },
  };
}

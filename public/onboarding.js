import { t, onLanguageChange } from './i18n.js';

export function initOnboarding({ api, loadProfile, loadTarget, date, email, onError }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'onboarding';
  dialog.setAttribute('aria-labelledby', 'onboarding-title');
  dialog.innerHTML = `<p id="onboarding-progress" class="muted"></p>
    <h2 id="onboarding-title" tabindex="-1"></h2>
    <p id="onboarding-help" class="onboarding-help"></p>
    <div id="onboarding-content"></div>
    <p id="onboarding-error" role="alert"></p>
    <div class="onboarding-actions">
      <button type="button" id="onboarding-back" class="btn-secondary"></button>
      <button type="button" id="onboarding-later" class="btn-secondary"></button>
      <button type="button" id="onboarding-next" class="btn-primary"></button>
    </div>`;
  document.body.appendChild(dialog);
  const get = (id) => dialog.querySelector(`#onboarding-${id}`);
  const panes = ['profile', 'target', 'ai'].map((name) => document.querySelector(`#settings-pane-${name}`));
  const forms = ['profile-form', 'target-form', 'voice-settings-form'].map((id) => document.getElementById(id));
  const steps = ['welcome', 'profile', 'target', 'ai', 'ready'];
  let step = 0;
  let opening = false;
  let busy = false;
  let generation = 0;
  const save = (state) => api('/users/onboarding', { method: 'PUT', body: JSON.stringify({ state }) });
  const render = () => {
    get('progress').textContent = t('onboarding.progress', { step: step + 1, total: steps.length });
    get('title').textContent = t(`onboarding.${steps[step]}Title`);
    get('help').textContent = t(`onboarding.${steps[step]}Help`);
    if (step === 2) {
      const suggestion = document.getElementById('target-suggestions');
      if (!suggestion.classList.contains('hidden')) get('help').textContent += `

${suggestion.textContent}`;
    }
    get('back').textContent = t('onboarding.back');
    get('back').disabled = busy || step === 0;
    get('later').textContent = t('onboarding.later');
    get('later').disabled = busy;
    get('next').textContent = t(busy ? 'onboarding.saving' : step === 4 ? 'onboarding.finish' : step === 0 ? 'onboarding.start' : 'onboarding.saveNext');
    get('next').disabled = busy;
    panes.forEach((pane, index) => pane.classList.toggle('hidden', step !== index + 1));
    if (!busy) get('title').focus();
  };
  const restore = () => {
    generation += 1;
    opening = false;
    panes.forEach((pane) => {
      document.querySelector(`[data-onboarding-home="${pane.id}"]`)?.replaceWith(pane);
      pane.classList.add('hidden');
    });
    document.querySelectorAll('#settings-section .settings-tab').forEach((tab) => {
      const active = tab.dataset.pane === 'settings-pane-theme';
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('#settings-section .settings-pane').forEach((pane) => {
      pane.classList.toggle('hidden', pane.id !== 'settings-pane-theme');
    });
    busy = false;
  };
  const close = () => {
    if (dialog.open) dialog.close();
    restore();
  };
  const open = async (force = false) => {
    if (dialog.open || opening || !email()) return;
    const token = ++generation;
    opening = true;
    const stored = await api('/users/onboarding').catch((error) => {
      if (token === generation) onError?.(error.message);
      return null;
    });
    if (token !== generation) return;
    opening = false;
    if (!stored || (!force && ['done', 'later'].includes(stored.state))) return;
    step = force ? 0 : Math.min(4, Math.max(0, Number(stored.state) || 0));
    document.getElementById('settings-section').classList.add('hidden');
    document.getElementById('settings-toggle').setAttribute('aria-expanded', 'false');
    panes.forEach((pane) => {
      const home = document.createElement('span');
      home.dataset.onboardingHome = pane.id;
      pane.replaceWith(home);
      get('content').appendChild(pane);
    });
    dialog.showModal();
    busy = true;
    get('error').textContent = '';
    render();
    await Promise.all([loadProfile(), loadTarget(date())]).catch((error) => {
      if (token === generation) get('error').textContent = error.message;
    });
    if (token !== generation) return;
    busy = false;
    render();
  };
  const persist = async (state, next) => {
    const token = generation;
    busy = true;
    get('error').textContent = '';
    render();
    const saved = await save(state).then(() => true, () => false);
    if (token !== generation) return;
    busy = false;
    if (!saved) {
      get('error').textContent = t('onboarding.error');
      render();
      return;
    }
    next();
  };
  const advance = () => persist(step === 4 ? 'done' : String(step + 1), () => {
    if (step === 4) return close();
    step += 1;
    render();
  });
  get('next').addEventListener('click', () => {
    if (busy) return;
    if (step === 0 || step === 4) return advance();
    const form = forms[step - 1];
    if (!form.reportValidity()) return;
    form.requestSubmit();
  });
  forms.forEach((form) => form.addEventListener('submit', (event) => {
    if (!dialog.open) return;
    if (busy) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    busy = true;
    get('error').textContent = '';
    render();
  }, true));
  get('back').addEventListener('click', () => persist(String(step - 1), () => {
    step -= 1;
    render();
  }));
  get('later').addEventListener('click', () => persist('later', close));
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    if (!busy) return persist('later', close);
  });
  document.addEventListener('setup-saved', (event) => {
    if (dialog.open && busy && event.detail === steps[step]) return advance();
  });
  document.addEventListener('setup-failed', () => {
    if (!dialog.open) return;
    busy = false;
    get('error').textContent = t('onboarding.error');
    render();
  });
  onLanguageChange(() => { if (dialog.open) render(); });
  document.getElementById('onboarding-restart').addEventListener('click', () => open(true));
  return { open, close };
}

// ─── Multi-tab State ──────────────────────────────────────────────────────────

export const tabs = [];
export let activeTabId = null;

export function activeTab() {
  return tabs.find(t => t.id === activeTabId) || null;
}

export function newTabData(id) {
  return {
    id,
    repoPath:        '',
    currentBranch:   '',
    repoInfo:        null,
    status:          null,
    branches:        null,
    branchTracking:  {},
    githubInfo:      null,
    stashList:       [],
    // Log panel state (per-tab)
    logBranch:       null,
    logCommits:      [],
    logSelectedIdx:  -1,
  };
}

// 'state' es un proxy que redirige lecturas/escrituras al tab activo
export const state = new Proxy({}, {
  get(_, key)        { const t = activeTab(); return t ? t[key] : undefined; },
  set(_, key, value) { const t = activeTab(); if (t) t[key] = value; return true; },
});

// ─── Session Persistence ──────────────────────────────────────────────────────

async function _api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`/api${path}`, opts);
  const ct  = res.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    throw new Error(`Error del servidor (${res.status} ${res.statusText}) — ¿Reiniciaste el servidor?`);
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export async function saveSession() {
  const openTabs = tabs.filter(t => t.repoPath).map(t => ({
    repoPath: t.repoPath,
    active: t.id === activeTabId
  }));
  try {
    await _api('POST', '/config/tabs', { openTabs });
  } catch (e) { console.warn('Error saving session:', e); }
}

export async function restoreSession() {
  try {
    const cfg = await _api('GET', '/config');
    window.mainBranch = cfg.mainBranch || 'main';
    if (cfg.openTabs && cfg.openTabs.length > 0) {
      // Limpiar tabs iniciales
      tabs.length = 0;

      let tabToFocus = null;

      cfg.openTabs.forEach(t => {
        const newTab = newTabData('tab_' + Math.random().toString(36).substr(2, 9));
        newTab.repoPath = t.repoPath;
        newTab.isLazy = true;
        tabs.push(newTab);
        if (t.active) tabToFocus = newTab.id;
      });

      if (tabToFocus) {
        await window.switchRepoTab(tabToFocus);
      } else if (tabs.length > 0) {
        await window.switchRepoTab(tabs[0].id);
      }
    } else {
      // Si no hay pestañas, crear una por defecto
      tabs.length = 0;
      const _firstTab = newTabData('tab_' + Date.now());
      tabs.push(_firstTab);
      activeTabId = _firstTab.id;
      window.renderTabBar();
      window.showWelcome();
    }
  } catch (e) {
    console.warn('Error restoring session:', e);
    // En caso de error, inicializar con pestaña vacía
    tabs.length = 0;
    const _firstTab = newTabData('tab_' + Date.now());
    tabs.push(_firstTab);
    activeTabId = _firstTab.id;
    window.renderTabBar();
    window.showWelcome();
  }
}

// Export activeTabId setter for use by tabs.js
export function setActiveTabId(id) {
  activeTabId = id;
}

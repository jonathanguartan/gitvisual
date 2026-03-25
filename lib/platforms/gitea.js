const { Octokit } = require('@octokit/rest');

function normalize(pr) {
  return {
    number:     pr.number,
    title:      pr.title,
    head:       { ref: pr.head?.ref || '' },
    base:       { ref: pr.base?.ref || '' },
    user:       { login: pr.user?.login || '' },
    created_at: pr.created_at,
    html_url:   pr.html_url,
  };
}

// Gitea incluye en html_url su APP_URL interna (puede ser localhost).
// Reemplazamos el origen con la URL configurada por el usuario.
function fixUrl(htmlUrl, configuredUrl) {
  if (!htmlUrl || !configuredUrl) return htmlUrl;
  try {
    const base = new URL(configuredUrl.replace(/\/+$/, ''));
    const pr   = new URL(htmlUrl);
    pr.protocol = base.protocol;
    pr.host     = base.host;
    return pr.toString();
  } catch (_) { return htmlUrl; }
}

module.exports = {
  id:      'gitea',
  name:    'Gitea',
  prLabel: 'Pull Request',

  configFields: [
    {
      key:         'url',
      label:       'URL de la instancia',
      type:        'text',
      placeholder: 'https://gitea.tuempresa.com',
      help:        '',
    },
    {
      key:         'token',
      label:       'Access Token',
      type:        'password',
      placeholder: 'tu-token-gitea',
      help:        '',
    },
  ],

  detect(url, cfg) {
    if (!cfg?.url) return null;
    try {
      const host = new URL(cfg.url).host;
      if (!url.includes(host)) return null;
      const parts = url.split(host)[1].replace(/^[/:]/, '').split('/');
      if (parts.length < 2) return null;
      return { type: 'gitea', owner: parts[0], repo: parts[1].replace(/\.git$/, '') };
    } catch (_) { return null; }
  },

  hasAuth(cfg) { return !!(cfg.token && cfg.url); },
  missingAuthMsg: 'Configura la URL e instancia de Gitea en ⚙ Configuración',

  async verifyAuth(cfg) {
    const baseUrl = cfg.url.replace(/\/+$/, '');
    const resp = await fetch(`${baseUrl}/api/v1/user`, {
      headers: { 'Authorization': 'token ' + cfg.token }
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data.message || resp.statusText);
    }
    const data = await resp.json();
    return { login: data.login };
  },

  async listPRs(cfg, { owner, repo }) {
    const baseUrl = `${cfg.url.replace(/\/+$/, '')}/api/v1`;
    const octokit = new Octokit({ auth: cfg.token, baseUrl });
    const res = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
      owner, repo, state: 'open', limit: 30,
    });
    return res.data.map(pr => {
      const n = normalize(pr);
      n.html_url = fixUrl(n.html_url, cfg.url);
      return n;
    });
  },

  async createPR(cfg, { owner, repo, title, body, head, base }) {
    const baseUrl = `${cfg.url.replace(/\/+$/, '')}/api/v1`;
    const octokit = new Octokit({ auth: cfg.token, baseUrl });
    const res = await octokit.request('POST /repos/{owner}/{repo}/pulls', {
      owner, repo, title, body, head, base,
    });
    const n = normalize(res.data);
    n.html_url = fixUrl(n.html_url, cfg.url);
    return n;
  },
};

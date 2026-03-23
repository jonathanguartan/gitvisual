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

  async listPRs(cfg, { owner, repo }) {
    const baseUrl = `${cfg.url.replace(/\/+$/, '')}/api/v1`;
    const octokit = new Octokit({ auth: cfg.token, baseUrl });
    const res = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
      owner, repo, state: 'open', limit: 30,
    });
    return res.data.map(normalize);
  },

  async createPR(cfg, { owner, repo, title, body, head, base }) {
    const baseUrl = `${cfg.url.replace(/\/+$/, '')}/api/v1`;
    const octokit = new Octokit({ auth: cfg.token, baseUrl });
    const res = await octokit.request('POST /repos/{owner}/{repo}/pulls', {
      owner, repo, title, body, head, base,
    });
    return normalize(res.data);
  },
};

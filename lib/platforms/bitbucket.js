function authHeader(cfg) {
  // Tanto API tokens como App Passwords usan Basic auth: base64(email:token)
  const secret = cfg.token || cfg.password;
  return 'Basic ' + Buffer.from(`${cfg.user}:${secret}`).toString('base64');
}

function normalize(pr) {
  return {
    number:     pr.id,
    title:      pr.title,
    head:       { ref: pr.source?.branch?.name      || '' },
    base:       { ref: pr.destination?.branch?.name || '' },
    user:       { login: pr.author?.display_name || pr.author?.nickname || '' },
    created_at: pr.created_on,
    html_url:   pr.links?.html?.href || '',
  };
}

module.exports = {
  id:      'bitbucket',
  name:    'Bitbucket',
  prLabel: 'Pull Request',

  configFields: [
    {
      key:         'user',
      label:       'Email / Usuario',
      type:        'text',
      placeholder: 'email@ejemplo.com',
      help:        'El email con el que inicias sesión (incluso si usas Google o Microsoft).',
    },
    {
      key:         'token',
      label:       'API Token / Access Token',
      type:        'password',
      placeholder: 'ATATTxxxxxxxxxxxxxxxxxxxxx',
      help:        'Bitbucket → avatar → Manage account → Personal settings → API tokens (o "Access tokens"). Formato: ATATT…',
    },
    {
      key:         'password',
      label:       'App Password (en desuso)',
      type:        'password',
      placeholder: 'ATBBxxxxxxxxxxxxxxxxxxxxx',
      help:        'Solo si aún usas App Passwords (ATBB…). Bitbucket los está retirando en favor de API tokens.',
    },
  ],

  detect(url) {
    const m = url.match(/bitbucket\.org[:/]([^/]+)\/([^/.]+)/i);
    if (!m) return null;
    return { 
      type:  'bitbucket', 
      owner: m[1], 
      repo:  m[2].replace(/\.git$/, '').replace(/\/$/, '') 
    };
  },

  hasAuth(cfg) { 
    // Bitbucket API v2 basic auth needs user + (token or app password)
    return !!(cfg && cfg.user && (cfg.token || cfg.password)); 
  },
  missingAuthMsg: 'Bitbucket requiere Usuario + Access Token/App Password en ⚙ Configuración',

  async listPRs(cfg, { owner, repo }) {
    if (!this.hasAuth(cfg)) throw new Error(this.missingAuthMsg);
    const url  = `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/pullrequests?state=OPEN&pagelen=30`;
    const resp = await fetch(url, { 
      headers: { 
        'Authorization': authHeader(cfg),
        'Accept': 'application/json'
      } 
    });

    if (!resp.ok) {
      let msg = resp.statusText;
      try {
        const errData = await resp.json();
        msg = errData.error?.message || errData.error?.detail || msg;
      } catch (_) { /* no era JSON */ }
      throw new Error(`Bitbucket ${resp.status} — ${msg}`);
    }

    const data = await resp.json();
    return (data.values || []).map(normalize);
  },

  async verifyAuth(cfg) {
    const resp = await fetch('https://api.bitbucket.org/2.0/user', {
      headers: { 'Authorization': authHeader(cfg), 'Accept': 'application/json' }
    });
    if (!resp.ok) {
      let msg = resp.statusText;
      try { const d = await resp.json(); msg = d.error?.message || d.error?.detail || msg; } catch (_) {}
      throw new Error(`Bitbucket ${resp.status} — ${msg}`);
    }
    const data = await resp.json();
    return { login: data.display_name || data.nickname };
  },

  async createPR(cfg, { owner, repo, title, body, head, base }) {
    const resp = await fetch(`https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/pullrequests`, {
      method:  'POST',
      headers: { Authorization: authHeader(cfg), 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        title,
        description: body,
        source:      { branch: { name: head } },
        destination: { branch: { name: base } },
      }),
    });
    const pr = await resp.json();
    if (!resp.ok) throw new Error(pr.error?.message || resp.statusText);
    return normalize(pr);
  },
};

function authHeader(cfg) {
  const password = cfg.token || cfg.password;
  return 'Basic ' + Buffer.from(`${cfg.user}:${password}`).toString('base64');
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
      label:       'Access Token (recomendado)',
      type:        'password',
      placeholder: 'ATATTxxxxxxxxxxxxxxxxxxxxx',
      help:        'Bitbucket → avatar → Manage account → Personal Bitbucket settings → Access tokens',
    },
    {
      key:         'password',
      label:       'App Password (alternativa)',
      type:        'password',
      placeholder: 'ATBBxxxxxxxxxxxxxxxxxxxxx',
      help:        'Bitbucket → avatar → Manage account → App passwords',
    },
  ],

  detect(url) {
    const m = url.match(/bitbucket\.org[:/]([^/]+)\/([^/.]+)/);
    return m ? { type: 'bitbucket', owner: m[1], repo: m[2].replace(/\.git$/, '') } : null;
  },

  hasAuth(cfg) { return !!(cfg.user && (cfg.token || cfg.password)); },
  missingAuthMsg: 'Configura las credenciales de Bitbucket en ⚙ Configuración',

  async listPRs(cfg, { owner, repo }) {
    const url  = `https://api.bitbucket.org/2.0/repositories/${owner}/${repo}/pullrequests?state=OPEN&pagelen=30`;
    const resp = await fetch(url, { headers: { Authorization: authHeader(cfg) } });
    const data = await resp.json();
    if (!resp.ok) {
      const msg = data.error?.message || data.error?.detail || resp.statusText;
      throw new Error(`Bitbucket ${resp.status} — ${msg}`);
    }
    return (data.values || []).map(normalize);
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

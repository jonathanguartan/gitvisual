function normalize(mr) {
  return {
    number:     mr.iid,
    title:      mr.title,
    head:       { ref: mr.source_branch || '' },
    base:       { ref: mr.target_branch || '' },
    user:       { login: mr.author?.username || '' },
    created_at: mr.created_at,
    html_url:   mr.web_url,
  };
}

module.exports = {
  id:      'gitlab',
  name:    'GitLab',
  prLabel: 'Merge Request',

  configFields: [
    {
      key:         'token',
      label:       'Personal Access Token',
      type:        'password',
      placeholder: 'glpat-…',
      help:        'GitLab → Preferencias → Access Tokens (scope: api)',
    },
  ],

  detect(url) {
    const m = url.match(/gitlab\.com[:/]([^/]+)\/([^/.]+)/);
    return m ? { type: 'gitlab', owner: m[1], repo: m[2].replace(/\.git$/, '') } : null;
  },

  hasAuth(cfg) { return !!cfg.token; },
  missingAuthMsg: 'Configura tu GitLab Token en ⚙ Configuración',

  async listPRs(cfg, { owner, repo }) {
    const project = encodeURIComponent(`${owner}/${repo}`);
    const resp = await fetch(
      `https://gitlab.com/api/v4/projects/${project}/merge_requests?state=opened&per_page=30`,
      { headers: { 'PRIVATE-TOKEN': cfg.token } }
    );
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.message || resp.statusText);
    return data.map(normalize);
  },

  async createPR(cfg, { owner, repo, title, body, head, base }) {
    const project = encodeURIComponent(`${owner}/${repo}`);
    const resp = await fetch(`https://gitlab.com/api/v4/projects/${project}/merge_requests`, {
      method:  'POST',
      headers: { 'PRIVATE-TOKEN': cfg.token, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ title, description: body, source_branch: head, target_branch: base }),
    });
    const mr = await resp.json();
    if (!resp.ok) throw new Error(mr.message || resp.statusText);
    return normalize(mr);
  },
};

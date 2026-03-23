const { Octokit } = require('@octokit/rest');

const API_VERSION = '2022-11-28';

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
  id:       'github',
  name:     'GitHub',
  prLabel:  'Pull Request',

  configFields: [
    {
      key:         'token',
      label:       'Personal Access Token',
      type:        'password',
      placeholder: 'ghp_…',
      help:        '',
    },
  ],

  detect(url) {
    const m = url.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
    return m ? { type: 'github', owner: m[1], repo: m[2].replace(/\.git$/, '') } : null;
  },

  hasAuth(cfg) { return !!cfg.token; },
  missingAuthMsg: 'Configura tu GitHub Token en ⚙ Configuración',

  async listPRs(cfg, { owner, repo }) {
    const octokit = new Octokit({ auth: cfg.token });
    const res = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
      owner, repo, state: 'open', per_page: 30,
      headers: { 'X-GitHub-Api-Version': API_VERSION },
    });
    return res.data.map(normalize);
  },

  async createPR(cfg, { owner, repo, title, body, head, base }) {
    const octokit = new Octokit({ auth: cfg.token });
    const headRef = !head.includes(':') ? `${owner}:${head}` : head;
    const res = await octokit.request('POST /repos/{owner}/{repo}/pulls', {
      owner, repo, title, body, head: headRef, base,
      headers: { 'X-GitHub-Api-Version': API_VERSION },
    });
    return normalize(res.data);
  },
};

const router   = require('express').Router();
const { handleGitError } = require('../lib/git-errors');
const { loadConfig } = require('../lib/config');
const registry = require('../lib/platforms');

// ─── Auth check ───────────────────────────────────────────────────────────────

router.get('/auth', (req, res) => {
  const { type } = req.query;
  const cfg      = loadConfig();

  const platform = registry.get(type);
  if (!platform) return res.json({ ok: false, message: `Plataforma desconocida: "${type}"` });

  const platformCfg = cfg.platforms?.[type] || {};
  if (!platform.hasAuth(platformCfg))
    return res.json({ ok: false, message: platform.missingAuthMsg });

  res.json({ ok: true });
});

// ─── Verify credentials ────────────────────────────────────────────────────────

router.post('/verify', async (req, res) => {
  const { type, ...credentials } = req.body;
  const platform = registry.get(type);
  if (!platform) return res.json({ ok: false, error: `Plataforma desconocida: "${type}"` });

  if (!platform.hasAuth(credentials))
    return res.json({ ok: false, error: platform.missingAuthMsg });

  try {
    const info = await platform.verifyAuth(credentials);
    res.json({ ok: true, login: info?.login || '' });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ─── List PRs ──────────────────────────────────────────────────────────────────

router.get('/list', async (req, res) => {
  const { owner, repo, type } = req.query;
  const cfg = loadConfig();

  const platform = registry.get(type);
  if (!platform) return res.status(400).json({ error: `Plataforma desconocida: "${type}"` });

  const platformCfg = cfg.platforms?.[type] || {};
  if (!platform.hasAuth(platformCfg))
    return res.status(400).json({ error: platform.missingAuthMsg });

  try {
    const prs = await platform.listPRs(platformCfg, { owner, repo });
    res.json(prs);
  } catch (e) {
    handleGitError(res, e);
  }
});

// ─── Create PR ─────────────────────────────────────────────────────────────────

router.post('/create', async (req, res) => {
  const { owner, repo, title, body, head, base, type } = req.body;
  const cfg = loadConfig();

  const platform = registry.get(type);
  if (!platform) return res.status(400).json({ error: `Plataforma desconocida: "${type}"` });

  const platformCfg = cfg.platforms?.[type] || {};
  if (!platform.hasAuth(platformCfg))
    return res.status(400).json({ error: platform.missingAuthMsg });

  try {
    const pr = await platform.createPR(platformCfg, { owner, repo, title, body, head, base });
    res.json({ success: true, pr });
  } catch (e) {
    handleGitError(res, e);
  }
});

module.exports = router;

const router   = require('express').Router();
const { loadConfig, saveConfig, saveRepoConfig, clearRepoConfig, getRepoOverrides } = require('../lib/config');
const registry = require('../lib/platforms');

router.get('/', (_req, res) => {
  res.json(loadConfig());
});

// Metadatos de plataformas para que el frontend renderice los ajustes dinámicamente
router.get('/platforms', (_req, res) => {
  res.json(registry.all.map(p => ({
    id:           p.id,
    name:         p.name,
    prLabel:      p.prLabel,
    configFields: p.configFields,
  })));
});

router.post('/save', (req, res) => {
  saveConfig(req.body);
  res.json({ success: true });
});

router.post('/tabs', (req, res) => {
  const { openTabs } = req.body;
  saveConfig({ openTabs });
  res.json({ success: true });
});

// ─── Per-repo config ──────────────────────────────────────────────────────────

// Devuelve la config global y los overrides del repo indicado
router.get('/repo', (req, res) => {
  const { repoPath } = req.query;
  const global    = loadConfig();
  const overrides = repoPath ? getRepoOverrides(repoPath) : {};
  res.json({ global, overrides });
});

// Guarda overrides para un repositorio concreto
router.post('/repo/save', (req, res) => {
  const { repoPath, ...partial } = req.body;
  if (!repoPath) return res.status(400).json({ error: 'repoPath requerido' });
  saveRepoConfig(repoPath, partial);
  res.json({ success: true });
});

// Elimina los overrides de un repositorio (vuelve a usar config global)
router.post('/repo/clear', (req, res) => {
  const { repoPath } = req.body;
  if (!repoPath) return res.status(400).json({ error: 'repoPath requerido' });
  clearRepoConfig(repoPath);
  res.json({ success: true });
});

module.exports = router;

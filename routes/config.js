const router   = require('express').Router();
const { loadConfig, saveConfig } = require('../lib/config');
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

module.exports = router;

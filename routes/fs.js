const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');

router.get('/list', (req, res) => {
  let { path: dirPath } = req.query;
  try {
    // Si no hay ruta en Windows, listar unidades
    if (!dirPath && process.platform === 'win32') {
      const drives = [];
      for (const letter of 'CDEFGHIJKLMNOPQRSTUVWXYZAB'.split('')) {
        const d = `${letter}:/`;
        try { fs.accessSync(d); drives.push({ name: d, path: d }); } catch (_) {}
      }
      return res.json({ entries: drives, current: '', parent: null });
    }

    // Prevención de Path Traversal:
    // 1. Normalizar la ruta
    // 2. Si contiene '..', lanzamos error
    if (dirPath && dirPath.includes('..')) {
      return res.status(400).json({ error: 'Ruta no permitida' });
    }

    const target = path.resolve(dirPath || '/').replace(/\\/g, '/');
    const skip   = new Set(['$Recycle.Bin', 'System Volume Information', 'Recovery', 'Config.Msi', 'DumpStack.log.tmp', 'hiberfil.sys', 'pagefile.sys', 'swapfile.sys']);

    const entries = fs.readdirSync(target, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.') && !skip.has(e.name))
      .map(e => ({ name: e.name, path: target.replace(/\/$/, '') + '/' + e.name }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    let parent = null;
    const isWinRoot = process.platform === 'win32' && /^[A-Za-z]:\/+$/.test(target + '/');
    if (isWinRoot) {
      parent = '';
    } else {
      const p = path.dirname(target).replace(/\\/g, '/');
      if (p !== target) parent = p;
    }

    res.json({ entries, current: target, parent });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/quickaccess', (_req, res) => {
  const home = (process.env.USERPROFILE || process.env.HOME || '').replace(/\\/g, '/');
  const candidates = [
    { name: '🏠 Inicio',      path: home },
    { name: '🖥  Escritorio', path: home + '/Desktop' },
    { name: '📄 Documentos',  path: home + '/Documents' },
    { name: '💻 C:/',         path: 'C:/' },
  ];
  const places = candidates.filter(p => {
    try { fs.accessSync(p.path); return true; } catch (_) { return false; }
  });
  res.json(places);
});

module.exports = router;

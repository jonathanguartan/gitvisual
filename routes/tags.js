const router = require('express').Router();
const { git } = require('../lib/git');

/**
 * Valida que un nombre de referencia sea seguro.
 */
function isValidRefName(name) {
  if (!name || typeof name !== 'string') return false;
  const invalidChars = /[\s\x00-\x1F\x7F~^:?*\[\\@]/;
  if (invalidChars.test(name)) return false;
  if (name.includes('..') || name.startsWith('/') || name.endsWith('/') || name.endsWith('.lock')) return false;
  if (name.startsWith('-')) return false;
  return true;
}

router.get('/tags', async (req, res) => {
  const { repoPath } = req.query;
  try {
    res.json(await git(repoPath).tags());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/tag/create', async (req, res) => {
  const { repoPath, tagName, message, hash } = req.body;
  if (!isValidRefName(tagName)) return res.status(400).json({ error: 'Nombre de etiqueta inválido' });
  if (hash && hash.startsWith('-')) return res.status(400).json({ error: 'Hash inválido' });

  try {
    const g = git(repoPath);
    if (message) {
      const args = ['tag', '-a', tagName, '-m', message];
      if (hash) args.push(hash);
      await g.raw(args);
    } else {
      const args = ['tag', tagName];
      if (hash) args.push(hash);
      await g.raw(args);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/tag/delete', async (req, res) => {
  const { repoPath, tagName } = req.body;
  if (!isValidRefName(tagName)) return res.status(400).json({ error: 'Nombre de etiqueta inválido' });
  try {
    await git(repoPath).tag(['-d', tagName]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

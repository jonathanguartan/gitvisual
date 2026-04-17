const router = require('express').Router();
const { git } = require('../lib/git');
const { handleGitError } = require('../lib/git-errors');
const { isValidRefName, validateRepoPath } = require('../lib/validation');

router.use(validateRepoPath);

router.get('/tags', async (req, res) => {
  const { repoPath } = req.query;
  try {
    const g = git(repoPath);
    const [tagList, refOut] = await Promise.all([
      g.tags(),
      g.raw(['for-each-ref', '--format=%(refname:short)|%(objecttype)', 'refs/tags']).catch(() => ''),
    ]);
    const typeMap = {};
    for (const line of refOut.trim().split('\n').filter(Boolean)) {
      const [name, type] = line.split('|');
      if (name) typeMap[name.trim()] = type?.trim() === 'tag' ? 'annotated' : 'lightweight';
    }
    // Obtener tags publicados en origin
    let remoteTags = new Set();
    try {
      const lsRemote = await g.raw(['ls-remote', '--tags', 'origin']);
      for (const line of lsRemote.trim().split('\n').filter(Boolean)) {
        const ref = line.split('\t')[1];
        if (ref && !ref.endsWith('^{}')) remoteTags.add(ref.replace('refs/tags/', ''));
      }
    } catch (_) {}

    const all = (tagList.all || []).map(t => ({ name: t, type: typeMap[t] || 'lightweight', remote: remoteTags.has(t) }));
    res.json({ all, latest: tagList.latest });
  } catch (e) {
    handleGitError(res, e);
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
    handleGitError(res, e);
  }
});

router.post('/tag/delete', async (req, res) => {
  const { repoPath, tagName } = req.body;
  if (!isValidRefName(tagName)) return res.status(400).json({ error: 'Nombre de etiqueta inválido' });
  try {
    await git(repoPath).tag(['-d', tagName]);
    res.json({ success: true });
  } catch (e) {
    handleGitError(res, e);
  }
});

router.post('/tag/push', async (req, res) => {
  const { repoPath, tagName, remote = 'origin' } = req.body;
  if (!isValidRefName(tagName)) return res.status(400).json({ error: 'Nombre de etiqueta inválido' });
  if (!remote || remote.startsWith('-')) return res.status(400).json({ error: 'Nombre de remoto inválido' });
  try {
    await git(repoPath).raw(['push', remote, tagName]);
    res.json({ success: true });
  } catch (e) {
    handleGitError(res, e);
  }
});

router.post('/tag/delete-remote', async (req, res) => {
  const { repoPath, tagName, remote = 'origin' } = req.body;
  if (!isValidRefName(tagName)) return res.status(400).json({ error: 'Nombre de etiqueta inválido' });
  if (!remote || remote.startsWith('-')) return res.status(400).json({ error: 'Nombre de remoto inválido' });
  try {
    await git(repoPath).raw(['push', remote, '--delete', tagName]);
    res.json({ success: true });
  } catch (e) {
    handleGitError(res, e);
  }
});

module.exports = router;

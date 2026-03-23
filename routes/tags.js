const router = require('express').Router();
const { git } = require('../lib/git');

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
  try {
    await git(repoPath).tag(['-d', tagName]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

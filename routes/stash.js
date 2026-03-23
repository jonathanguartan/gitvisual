const router = require('express').Router();
const { git } = require('../lib/git');

router.get('/stash/list', async (req, res) => {
  const { repoPath } = req.query;
  try {
    const output = await git(repoPath).stash(['list', '--format=%gd|||%s|||%cr']);
    const stashes = output.trim().split('\n').filter(Boolean).map(line => {
      const [ref, message, date] = line.split('|||').map(s => s.trim());
      return { ref, message, date };
    });
    res.json(stashes);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/stash', async (req, res) => {
  const { repoPath, message, includeUntracked } = req.body;
  try {
    const args = [];
    if (includeUntracked) args.push('-u');
    if (message) args.push('-m', message);
    res.json({ success: true, result: await git(repoPath).stash(args.length ? args : undefined) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/stash/pop', async (req, res) => {
  const { repoPath, ref } = req.body;
  try {
    res.json({ success: true, result: await git(repoPath).stash(ref ? ['pop', ref] : ['pop']) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/stash/apply', async (req, res) => {
  const { repoPath, ref } = req.body;
  try {
    res.json({ success: true, result: await git(repoPath).stash(ref ? ['apply', ref] : ['apply']) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/stash/drop', async (req, res) => {
  const { repoPath, ref } = req.body;
  try {
    res.json({ success: true, result: await git(repoPath).stash(ref ? ['drop', ref] : ['drop']) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/stash/show', async (req, res) => {
  const { repoPath, ref } = req.query;
  try {
    const diff = await git(repoPath).raw(['stash', 'show', '-p', '--format=', ref]);
    res.json({ diff });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

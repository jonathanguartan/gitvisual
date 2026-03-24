const router = require('express').Router();
const { git } = require('../lib/git');

// Scan for lost stashes (git fsck) and deleted branches (reflog)
router.get('/recover/scan', async (req, res) => {
  const { repoPath } = req.query;
  if (!repoPath) return res.status(400).json({ error: 'Ruta no proporcionada' });

  try {
    const g = git(repoPath);
    // Get all branches (-a) to include remotes, and normalize names
    const allBranches = await g.branch(['-a']);
    const seen = new Set(allBranches.all.map(b => b.replace(/^remotes\/[^/]+\//, '')));

    // 1. Lost stashes via git fsck --unreachable
    const stashes = [];
    try {
      const fsckOut = await g.raw(['fsck', '--unreachable', '--no-reflogs']);
      const hashes = fsckOut.split('\n')
        .filter(l => l.startsWith('unreachable commit'))
        .map(l => l.split(' ')[2])
        .filter(Boolean);

      for (const hash of hashes) {
        try {
          const log = await g.raw(['log', '-1', '--merges', `--format=%at|%H|%gs|%cr`, hash]);
          if (log.trim()) {
            const parts = log.trim().split('|');
            if (parts.length >= 4) {
              stashes.push({
                timestamp: parseInt(parts[0]) || 0,
                hash:      parts[1].trim().substring(0, 8),
                fullHash:  parts[1].trim(),
                message:   parts[2].trim(),
                ago:       parts[3].trim(),
              });
            }
          }
        } catch (_) {}
      }
      stashes.sort((a, b) => b.timestamp - a.timestamp);
    } catch (e) {
      console.warn('[recover/scan] fsck:', e.message);
    }

    // 2. Deleted branches via HEAD reflog
    const deletedBranches = [];
    try {
      const reflogOut = await g.raw(['reflog', '--format=%H|%gs|%cr']);
      for (const line of reflogOut.split('\n')) {
        const parts = line.split('|');
        if (parts.length < 3) continue;
        const [hash, subject, ago] = parts;
        const match = subject.match(/^checkout: moving from (.+) to .+/);
        if (!match) continue;
        const branchName = match[1].trim();
        if (!seen.has(branchName)) {
          seen.add(branchName);
          deletedBranches.push({ hash: hash.trim(), name: branchName, ago: ago.trim() });
        }
      }
    } catch (e) {
      console.warn('[recover/scan] reflog:', e.message);
    }

    res.json({ stashes, deletedBranches });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/recover/stash-apply', async (req, res) => {
  const { repoPath, fullHash } = req.body;
  try {
    await git(repoPath).raw(['stash', 'apply', fullHash]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/recover/stash-store', async (req, res) => {
  const { repoPath, fullHash, message } = req.body;
  try {
    await git(repoPath).raw(['stash', 'store', '-m', message || 'Stash recuperado', fullHash]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/recover/branch', async (req, res) => {
  const { repoPath, hash, name } = req.body;
  try {
    await git(repoPath).raw(['branch', name, hash]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

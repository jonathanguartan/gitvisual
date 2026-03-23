const router = require('express').Router();
const { git } = require('../lib/git');

router.get('/branches', async (req, res) => {
  const { repoPath } = req.query;
  try {
    res.json(await git(repoPath).branch(['-a', '-v']));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Ahead/behind info for all local branches via for-each-ref
router.get('/branches/tracking', async (req, res) => {
  const { repoPath } = req.query;
  try {
    const out = await git(repoPath).raw([
      'for-each-ref',
      '--format=%(refname:short)|%(upstream:short)|%(upstream:track)',
      'refs/heads',
    ]);
    const result = {};
    for (const line of out.trim().split('\n').filter(Boolean)) {
      const [name, upstream, track] = line.split('|');
      const aheadMatch  = track?.match(/ahead (\d+)/);
      const behindMatch = track?.match(/behind (\d+)/);
      result[name.trim()] = {
        upstream:    upstream?.trim() || null,
        hasUpstream: !!(upstream?.trim()),
        ahead:       aheadMatch  ? parseInt(aheadMatch[1])  : 0,
        behind:      behindMatch ? parseInt(behindMatch[1]) : 0,
      };
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/branch/create', async (req, res) => {
  const { repoPath, branchName, fromBranch, noCheckout } = req.body;
  try {
    const g = git(repoPath);
    if (noCheckout) {
      const args = ['branch', branchName];
      if (fromBranch) args.push(fromBranch);
      await g.raw(args);
    } else {
      if (fromBranch) await g.checkoutBranch(branchName, fromBranch);
      else            await g.checkoutLocalBranch(branchName);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/branch/checkout', async (req, res) => {
  const { repoPath, branchName } = req.body;
  try {
    await git(repoPath).checkout(branchName);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/branch/checkout-remote', async (req, res) => {
  const { repoPath, remoteName } = req.body; // e.g. "origin/feature-x"
  const parts     = remoteName.split('/');
  const localName = parts.slice(1).join('/');
  try {
    await git(repoPath).raw(['checkout', '-b', localName, '--track', remoteName]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/branch/delete', async (req, res) => {
  const { repoPath, branchName, force } = req.body;
  try {
    await git(repoPath).deleteLocalBranch(branchName, !!force);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/branch/rename', async (req, res) => {
  const { repoPath, branchName, newName } = req.body;
  try {
    await git(repoPath).raw(['branch', '-m', branchName, newName]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/branch/delete-remote', async (req, res) => {
  const { repoPath, remote, branch } = req.body;
  try {
    await git(repoPath).raw(['push', remote, '--delete', branch]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/branch/rebase', async (req, res) => {
  const { repoPath, onto } = req.body;
  try {
    await git(repoPath).rebase([onto]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Actualiza una rama local desde su remota sin hacer checkout (fast-forward only)
router.post('/branch/pull-ff', async (req, res) => {
  const { repoPath, branch, remote = 'origin' } = req.body;
  try {
    await git(repoPath).raw(['fetch', remote, `${branch}:${branch}`]);
    res.json({ success: true });
  } catch (e) {
    const msg = e.message.includes('non-fast-forward') || e.message.includes('rejected')
      ? `No se puede actualizar "${branch}" automáticamente: la rama tiene cambios locales que divergen del remote. Haz checkout y luego pull.`
      : e.message;
    res.status(500).json({ error: msg });
  }
});

router.post('/branch/set-upstream', async (req, res) => {
  const { repoPath, branchName, upstream } = req.body;
  try {
    await git(repoPath).raw(['branch', `--set-upstream-to=${upstream}`, branchName]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Crear rama en un commit específico sin hacer checkout
router.post('/branch/create-at', async (req, res) => {
  const { repoPath, branchName, hash } = req.body;
  try {
    await git(repoPath).raw(['branch', branchName, hash]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/merge', async (req, res) => {
  const { repoPath, sourceBranch } = req.body;
  try {
    res.json({ success: true, result: await git(repoPath).merge([sourceBranch]) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/cherry-pick', async (req, res) => {
  const { repoPath, commitHash, targetBranch } = req.body;
  try {
    const g = git(repoPath);
    const status = await g.status();
    if (targetBranch && targetBranch !== status.current) {
      const branches = await g.branchLocal();
      if (!branches.all.includes(targetBranch)) await g.checkoutLocalBranch(targetBranch);
      else                                       await g.checkout(targetBranch);
    }
    await g.raw(['cherry-pick', commitHash]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/branch/compare', async (req, res) => {
  const { repoPath, from, to } = req.query;
  try {
    const g = git(repoPath);
    const [diff, log] = await Promise.all([
      g.raw(['diff', `${from}...${to}`]),
      g.raw(['log', '--oneline', '--no-decorate', `${from}..${to}`]),
    ]);
    res.json({
      diff,
      commits: log.trim().split('\n').filter(Boolean),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/branches/merged', async (req, res) => {
  const { repoPath, base } = req.query;
  try {
    const out = await git(repoPath).raw(['branch', '--merged', base || 'HEAD']);
    const protect = new Set(['main', 'master', 'develop', 'dev', base].filter(Boolean));
    const branches = out.trim().split('\n')
      .map(b => b.trim().replace(/^\*\s*/, ''))
      .filter(b => b && !protect.has(b));
    res.json({ branches });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

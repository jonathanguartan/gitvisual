const router = require('express').Router();
const { git } = require('../lib/git');
const { handleGitError } = require('../lib/git-errors');
const { isValidRefName, validateRepoPath } = require('../lib/validation');

router.use(validateRepoPath);

router.get('/branches', async (req, res) => {
  const { repoPath } = req.query;
  try {
    res.json(await git(repoPath).branch(['-a', '-v']));
  } catch (e) {
    handleGitError(res, e);
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
    handleGitError(res, e);
  }
});

router.post('/branch/create', async (req, res) => {
  const { repoPath, branchName, fromBranch, noCheckout } = req.body;
  if (!isValidRefName(branchName)) return res.status(400).json({ error: 'Nombre de rama inválido' });
  if (fromBranch && !isValidRefName(fromBranch)) return res.status(400).json({ error: 'Nombre de rama base inválido' });

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
    handleGitError(res, e);
  }
});

router.post('/branch/checkout', async (req, res) => {
  const { repoPath, branchName } = req.body;
  if (!isValidRefName(branchName)) return res.status(400).json({ error: 'Nombre de rama inválido' });
  try {
    await git(repoPath).checkout(branchName);
    res.json({ success: true });
  } catch (e) {
    handleGitError(res, e);
  }
});

router.post('/branch/checkout-remote', async (req, res) => {
  const { repoPath, remoteName } = req.body; // e.g. "origin/feature-x"
  if (!remoteName || remoteName.startsWith('-')) return res.status(400).json({ error: 'Nombre de rama remota inválido' });
  
  const parts     = remoteName.split('/');
  const localName = parts.slice(1).join('/');
  if (!isValidRefName(localName)) return res.status(400).json({ error: 'Nombre de rama local resultante inválido' });

  try {
    const g = git(repoPath);
    const branches = await g.branchLocal();
    if (branches.all.includes(localName)) {
      return res.status(400).json({ error: `Ya existe una rama local llamada "${localName}". Haz checkout directamente o renómbrala primero.` });
    }
    await g.raw(['checkout', '-b', localName, '--track', remoteName]);
    res.json({ success: true });
  } catch (e) {
    handleGitError(res, e);
  }
});

router.post('/branch/delete', async (req, res) => {
  const { repoPath, branchName, force } = req.body;
  if (!isValidRefName(branchName)) return res.status(400).json({ error: 'Nombre de rama inválido' });
  try {
    const g = git(repoPath);
    const status = await g.status();
    if (status.current === branchName) {
      return res.status(400).json({ error: `No puedes eliminar la rama activa ("${branchName}"). Cambia a otra rama primero.` });
    }
    await g.deleteLocalBranch(branchName, !!force);
    res.json({ success: true });
  } catch (e) {
    handleGitError(res, e);
  }
});

router.post('/branch/rename', async (req, res) => {
  const { repoPath, branchName, newName } = req.body;
  if (!isValidRefName(branchName) || !isValidRefName(newName)) return res.status(400).json({ error: 'Nombre de rama inválido' });
  try {
    await git(repoPath).raw(['branch', '-m', branchName, newName]);
    res.json({ success: true });
  } catch (e) {
    handleGitError(res, e);
  }
});

router.post('/branch/delete-remote', async (req, res) => {
  const { repoPath, remote, branch } = req.body;
  if (!isValidRefName(branch)) return res.status(400).json({ error: 'Nombre de rama inválido' });
  if (!remote || remote.startsWith('-')) return res.status(400).json({ error: 'Nombre de remoto inválido' });
  try {
    await git(repoPath).raw(['push', remote, '--delete', branch]);
    res.json({ success: true });
  } catch (e) {
    handleGitError(res, e);
  }
});

router.post('/branch/rebase', async (req, res) => {
  const { repoPath, onto } = req.body;
  if (!isValidRefName(onto)) return res.status(400).json({ error: 'Nombre de rama base inválido' });
  try {
    await git(repoPath).rebase([onto]);
    res.json({ success: true });
  } catch (e) {
    if (e.message.includes('CONFLICT') || e.message.includes('REBASE'))
      return res.status(500).json({ error: `Conflictos detectados durante el rebase sobre "${onto}". El repositorio está en modo rebase; resuelve los conflictos o usa --abort.` });
    handleGitError(res, e);
  }
});

// Actualiza una rama local desde su remota sin hacer checkout (fast-forward only)
router.post('/branch/pull-ff', async (req, res) => {
  const { repoPath, branch, remote = 'origin' } = req.body;
  if (!isValidRefName(branch)) return res.status(400).json({ error: 'Nombre de rama inválido' });
  try {
    await git(repoPath).raw(['fetch', remote, `${branch}:${branch}`]);
    res.json({ success: true });
  } catch (e) {
    if (e.message.includes('non-fast-forward') || e.message.includes('rejected'))
      return res.status(500).json({ error: `No se puede actualizar "${branch}" automáticamente: la rama tiene cambios locales que divergen del remote. Haz checkout y luego pull.` });
    handleGitError(res, e);
  }
});

router.post('/branch/set-upstream', async (req, res) => {
  const { repoPath, branchName, upstream } = req.body;
  if (!isValidRefName(branchName) || !isValidRefName(upstream)) return res.status(400).json({ error: 'Nombre de rama inválido' });
  try {
    await git(repoPath).raw(['branch', `--set-upstream-to=${upstream}`, branchName]);
    res.json({ success: true });
  } catch (e) {
    handleGitError(res, e);
  }
});

// Crear rama en un commit específico sin hacer checkout
router.post('/branch/create-at', async (req, res) => {
  const { repoPath, branchName, hash } = req.body;
  if (!isValidRefName(branchName)) return res.status(400).json({ error: 'Nombre de rama inválido' });
  if (!hash || hash.startsWith('-')) return res.status(400).json({ error: 'Hash de commit inválido' });
  try {
    await git(repoPath).raw(['branch', branchName, hash]);
    res.json({ success: true });
  } catch (e) {
    handleGitError(res, e);
  }
});

// Fetch del remote + merge o rebase desde una rama remota hacia la rama activa
router.post('/branch/merge-from-remote', async (req, res) => {
  const { repoPath, remoteBranch, strategy = 'merge' } = req.body;
  // remoteBranch: e.g. "origin/main" o "remotes/origin/main"
  if (!remoteBranch || remoteBranch.startsWith('-')) return res.status(400).json({ error: 'Nombre de rama remota inválido' });

  const normalized = remoteBranch.replace(/^remotes\//, ''); // "origin/main"
  const parts      = normalized.split('/');
  if (parts.length < 2) return res.status(400).json({ error: 'Formato de rama remota inválido (espera origin/branch)' });
  const remote     = parts[0];
  const remoteName = parts.slice(1).join('/');

  try {
    const g = git(repoPath);
    await g.fetch(remote, remoteName);

    if (strategy === 'rebase') {
      await g.rebase([normalized]);
    } else {
      await g.merge([normalized]);
    }
    res.json({ success: true });
  } catch (e) {
    if (e.message.includes('CONFLICT'))
      return res.status(500).json({ error: `Conflictos al integrar "${normalized}". Resuélvelos en la pestaña de cambios.` });
    handleGitError(res, e);
  }
});

// Abortar o continuar merge/rebase en progreso
router.post('/conflict/abort', async (req, res) => {
  const { repoPath, state } = req.body; // state: 'MERGING' | 'REBASING' | 'CHERRY-PICKING' | 'REVERTING'
  try {
    const g = git(repoPath);
    if (state === 'MERGING')         await g.raw(['merge', '--abort']);
    else if (state === 'REBASING')   await g.raw(['rebase', '--abort']);
    else if (state === 'CHERRY-PICKING') await g.raw(['cherry-pick', '--abort']);
    else if (state === 'REVERTING')  await g.raw(['revert', '--abort']);
    else return res.status(400).json({ error: 'Estado desconocido: ' + state });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/conflict/continue', async (req, res) => {
  const { repoPath, state, message } = req.body;
  try {
    const g = git(repoPath);
    if (state === 'MERGING') {
      // Para continuar un merge hay que hacer commit con los conflictos resueltos
      if (!message) return res.status(400).json({ error: 'Se requiere mensaje de commit para continuar el merge' });
      await g.commit(message);
    } else if (state === 'REBASING') {
      await g.raw(['rebase', '--continue']);
    } else if (state === 'CHERRY-PICKING') {
      await g.raw(['cherry-pick', '--continue']);
    } else if (state === 'REVERTING') {
      await g.raw(['revert', '--continue']);
    } else return res.status(400).json({ error: 'Estado desconocido: ' + state });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/merge', async (req, res) => {
  const { repoPath, sourceBranch } = req.body;
  if (!isValidRefName(sourceBranch)) return res.status(400).json({ error: 'Nombre de rama origen inválido' });
  try {
    res.json({ success: true, result: await git(repoPath).merge([sourceBranch]) });
  } catch (e) {
    if (e.message.includes('CONFLICT'))
      return res.status(500).json({ error: `Conflictos detectados al fusionar "${sourceBranch}". Resuélvelos en la pestaña de cambios.` });
    handleGitError(res, e);
  }
});

router.post('/cherry-pick', async (req, res) => {
  const { repoPath, commitHash, targetBranch } = req.body;
  if (!commitHash || commitHash.startsWith('-')) return res.status(400).json({ error: 'Hash de commit inválido' });
  if (targetBranch && !isValidRefName(targetBranch)) return res.status(400).json({ error: 'Nombre de rama destino inválido' });
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
    if (e.message.includes('CONFLICT'))
      return res.status(500).json({ error: 'Conflictos detectados durante el cherry-pick. Resuélvelos manualmente.' });
    handleGitError(res, e);
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
    handleGitError(res, e);
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
    handleGitError(res, e);
  }
});

module.exports = router;

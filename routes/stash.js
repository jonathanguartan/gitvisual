const router = require('express').Router();
const { git } = require('../lib/git');
const { handleGitError } = require('../lib/git-errors');
const { validateRepoPath } = require('../lib/validation');

router.use(validateRepoPath);

// Parsea el subject de git stash en sus partes:
// "On branch feature/xxx: abc1234 Descripción" → { branch, description }
// "WIP on main: abc1234 último commit"         → { branch, description, wip: true }
function parseStashMessage(raw) {
  const m = raw.match(/^(WIP on|On branch) ([^:]+): [0-9a-f]+ (.+)$/);
  if (!m) return { branch: '', description: raw };
  return { branch: m[2].trim(), description: m[3].trim(), wip: m[1] === 'WIP on' };
}

router.get('/stash/list', async (req, res) => {
  const { repoPath } = req.query;
  try {
    const output = await git(repoPath).stash(['list', '--format=%gd|||%s|||%cr']);
    const stashes = output.trim().split('\n').filter(Boolean).map(line => {
      const [ref, rawMessage, date] = line.split('|||').map(s => s.trim());
      const seq = (ref.match(/\{(\d+)\}/) || [])[1] ?? '?';
      const { branch, description, wip } = parseStashMessage(rawMessage);
      return { ref, seq, branch, description, wip: !!wip, date };
    });
    res.json(stashes);
  } catch (e) {
    handleGitError(res, e);
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
    handleGitError(res, e);
  }
});

// Incrementa el índice numérico de un ref de stash: stash@{N} → stash@{N+1}
function shiftRef(ref) {
  if (!ref) return 'stash@{1}';
  return ref.replace(/\{(\d+)\}/, (_, n) => `{${parseInt(n, 10) + 1}}`);
}

// Git no puede ni empezar: ficheros locales bloquean la aplicación del stash
function isPreventedError(msg) {
  return msg.includes('would be overwritten') || msg.includes('already exists, no checkout');
}

// Git aplicó lo que pudo pero dejó marcadores de conflicto (<<<) en los archivos
function isMergeConflict(msg) {
  return msg.includes('CONFLICT') || msg.includes('Merge conflict');
}

router.post('/stash/pop', async (req, res) => {
  const { repoPath, ref, autoStash } = req.body;
  try {
    if (autoStash) {
      const out = await git(repoPath).stash(['push', '--include-untracked', '-m', `Auto-stash antes de aplicar ${ref || 'stash'}`]);
      const didStash = !out.includes('No local changes to save');
      const target = didStash ? shiftRef(ref) : (ref || 'stash@{0}');
      await git(repoPath).stash(['pop', target]);
    } else {
      await git(repoPath).stash(ref ? ['pop', ref] : ['pop']);
    }
    res.json({ success: true });
  } catch (e) {
    if (!autoStash && isMergeConflict(e.message))
      return res.json({ conflict: true, type: 'merge' });
    if (!autoStash && isPreventedError(e.message))
      return res.json({ conflict: true, type: 'prevented' });
    handleGitError(res, e);
  }
});

router.post('/stash/apply', async (req, res) => {
  const { repoPath, ref, autoStash } = req.body;
  try {
    if (autoStash) {
      const out = await git(repoPath).stash(['push', '--include-untracked', '-m', `Auto-stash antes de aplicar ${ref || 'stash'}`]);
      const didStash = !out.includes('No local changes to save');
      const target = didStash ? shiftRef(ref) : (ref || 'stash@{0}');
      await git(repoPath).stash(['apply', target]);
    } else {
      await git(repoPath).stash(ref ? ['apply', ref] : ['apply']);
    }
    res.json({ success: true });
  } catch (e) {
    if (!autoStash && isMergeConflict(e.message))
      return res.json({ conflict: true, type: 'merge' });
    if (!autoStash && isPreventedError(e.message))
      return res.json({ conflict: true, type: 'prevented' });
    handleGitError(res, e);
  }
});

router.post('/stash/drop', async (req, res) => {
  const { repoPath, ref } = req.body;
  try {
    res.json({ success: true, result: await git(repoPath).stash(ref ? ['drop', ref] : ['drop']) });
  } catch (e) {
    handleGitError(res, e);
  }
});

router.get('/stash/show', async (req, res) => {
  const { repoPath, ref } = req.query;
  try {
    const diff = await git(repoPath).raw(['stash', 'show', '-p', '--format=', ref]);
    res.json({ diff });
  } catch (e) {
    handleGitError(res, e);
  }
});

module.exports = router;

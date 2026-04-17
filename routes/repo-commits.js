'use strict';
const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const { git } = require('../lib/git');
const { loadConfig } = require('../lib/config');
const { handleGitError } = require('../lib/git-errors');
const { isValidHash } = require('../lib/validation');

// ─── Diff ──────────────────────────────────────────────────────────────────────

router.get('/diff', async (req, res) => {
  const { repoPath, file, staged } = req.query;
  const cfg = loadConfig();
  const ctx = cfg.diffContext ?? 3;
  try {
    const g = git(repoPath);
    const baseArgs = [`-U${ctx}`, ...(file ? ['--', file] : [])];
    const diff = staged === 'true'
      ? await g.diff(['--cached', ...baseArgs])
      : await g.diff(baseArgs);
    res.json({ diff });
  } catch (e) {
    handleGitError(res, e);
  }
});

router.get('/commit/files', async (req, res) => {
  const { repoPath, hash } = req.query;
  try {
    const g = git(repoPath);
    const [nsOut, statOut] = await Promise.all([
      g.raw(['diff-tree', '--no-commit-id', '-r', '--name-status', hash]),
      g.raw(['diff-tree', '--no-commit-id', '-r', '--numstat', hash]),
    ]);

    // Build insertion/deletion map from numstat
    const statsMap = {};
    statOut.trim().split('\n').filter(Boolean).forEach(line => {
      const [add, del, ...pathParts] = line.split('\t');
      const p = pathParts.join('\t');
      statsMap[p] = { add: parseInt(add, 10) || 0, del: parseInt(del, 10) || 0 };
    });

    const files = nsOut.trim().split('\n').filter(Boolean).map(line => {
      const [status, ...rest] = line.split('\t');
      const oldPath = rest[0] || '';
      const newPath = rest[1] || oldPath;
      const s = statsMap[newPath] || statsMap[oldPath] || { add: 0, del: 0 };
      return { status: status[0], path: newPath, oldPath: status[0] === 'R' ? oldPath : null, add: s.add, del: s.del };
    });
    res.json({ files });
  } catch (e) {
    handleGitError(res, e);
  }
});

router.get('/commit/diff', async (req, res) => {
  const { repoPath, hash, file } = req.query;
  if (hash && hash.startsWith('-')) return res.status(400).json({ error: 'Hash inválido' });
  try {
    res.json({ diff: await git(repoPath).raw(['show', `${hash}`, '--', file]) });
  } catch (e) {
    handleGitError(res, e);
  }
});

router.get('/commit/diff-range', async (req, res) => {
  const { repoPath, hash1, hash2, file } = req.query;
  if ((hash1 && hash1.startsWith('-')) || (hash2 && hash2.startsWith('-')))
    return res.status(400).json({ error: 'Hash inválido' });
  try {
    res.json({ diff: await git(repoPath).raw(['diff', hash1, hash2, '--', file]) });
  } catch (e) {
    handleGitError(res, e);
  }
});

router.post('/stage-hunk', async (req, res) => {
  const { repoPath, patch, reverse } = req.body;
  const tmpId = require('crypto').randomBytes(8).toString('hex');
  const tmp   = path.join(require('os').tmpdir(), `gvm-hunk-${tmpId}.patch`);
  try {
    fs.writeFileSync(tmp, patch, 'utf8');
    const args = ['apply', '--cached'];
    if (reverse) args.push('--reverse');
    args.push(tmp);
    await git(repoPath).raw(args);
    fs.unlinkSync(tmp);
    res.json({ success: true });
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) {}
    handleGitError(res, e);
  }
});

// ─── Commits ──────────────────────────────────────────────────────────────────

router.post('/commit', async (req, res) => {
  const { repoPath, message, amend } = req.body;
  const opts = amend ? ['--amend'] : [];
  const tryCommit = () => git(repoPath).commit(message, opts);
  try {
    res.json({ success: true, result: await tryCommit() });
  } catch (e) {
    if (e.message.includes('lock') || e.message.includes('index.lock')) {
      await new Promise(r => setTimeout(r, 1200));
      try {
        res.json({ success: true, result: await tryCommit() });
      } catch (e2) {
        handleGitError(res, e2);
      }
    } else {
      handleGitError(res, e);
    }
  }
});

router.post('/commit/revert', async (req, res) => {
  const { repoPath, hash } = req.body;
  try {
    await git(repoPath).revert([hash, '--no-edit']);
    res.json({ success: true });
  } catch (e) {
    handleGitError(res, e);
  }
});

router.post('/reset', async (req, res) => {
  const { repoPath, hash, mode = 'mixed' } = req.body;
  if (!['soft', 'mixed', 'hard'].includes(mode)) return res.status(400).json({ error: 'Modo inválido' });
  if (hash && !isValidHash(hash)) return res.status(400).json({ error: 'Hash inválido' });
  try {
    const args = [`--${mode}`];
    if (hash) args.push(hash);
    await git(repoPath).reset(args);
    res.json({ success: true });
  } catch (e) {
    handleGitError(res, e);
  }
});

// ─── Conflict resolution ──────────────────────────────────────────────────────

router.post('/checkout-conflict', async (req, res) => {
  const { repoPath, file, side } = req.body;
  if (!['ours', 'theirs'].includes(side)) return res.status(400).json({ error: 'Lado inválido' });
  if (!file || typeof file !== 'string' || file.startsWith('-')) return res.status(400).json({ error: 'Ruta inválida' });
  try {
    const g = git(repoPath);
    await g.raw(['checkout', `--${side}`, '--', file]);
    await g.raw(['add', '--', file]);
    res.json({ success: true });
  } catch (e) {
    handleGitError(res, e);
  }
});

module.exports = router;

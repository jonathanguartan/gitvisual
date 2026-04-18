'use strict';
const router  = require('express').Router();
const path    = require('path');
const fs      = require('fs');
const simpleGit = require('simple-git');
const { git }   = require('../lib/git');
const { loadRepoConfig } = require('../lib/config');
const registry = require('../lib/platforms');
const { handleGitError } = require('../lib/git-errors');
const { isValidRefName, validateRepoPath } = require('../lib/validation');
const logger = require('../lib/logger');

// ─── Repo Check & Init ─────────────────────────────────────────────────────────

router.get('/check', async (req, res) => {
  const { repoPath } = req.query;
  if (!repoPath) return res.json({ isRepo: false, error: 'Ruta no proporcionada' });

  try {
    const g = git(repoPath);

    let isRepo = false;
    try {
      isRepo = await g.checkIsRepo();
    } catch (gitErr) {
      logger.warn('[repo/check] checkIsRepo falló', { msg: gitErr.message });
      const gitDir = path.join(repoPath, '.git');
      isRepo = fs.existsSync(gitDir);
    }

    if (!isRepo) return res.json({ isRepo: false });

    let hasName = false, hasEmail = false, hasRemote = false;
    try {
      const [config, remotes] = await Promise.all([g.listConfig(), g.getRemotes(true)]);
      hasName   = !!config.all['user.name'];
      hasEmail  = !!config.all['user.email'];
      hasRemote = remotes.length > 0;
    } catch (gitErr) {
      logger.warn('[repo/check] git config/remotes falló', { msg: gitErr.message });
    }

    res.json({
      isRepo: true,
      configComplete: hasName && hasEmail && hasRemote,
      missingConfig: { name: !hasName, email: !hasEmail, remote: !hasRemote },
    });
  } catch (e) {
    logger.error('[repo/check] error', { msg: e.message });
    res.json({ isRepo: false, error: e.message });
  }
});

router.post('/init', async (req, res) => {
  const { repoPath } = req.body;
  try {
    await git(repoPath).init();
    res.json({ success: true });
  } catch (e) {
    handleGitError(res, e);
  }
});

router.post('/clone', async (req, res) => {
  const { remoteUrl, localPath } = req.body;
  try {
    await simpleGit().clone(remoteUrl, localPath);
    res.json({ success: true });
  } catch (e) {
    handleGitError(res, e);
  }
});

// A partir de aquí todas las rutas requieren un repoPath válido y existente
router.use(validateRepoPath);

// ─── Repo Info ─────────────────────────────────────────────────────────────────

router.get('/info', async (req, res) => {
  const { repoPath } = req.query;
  const configApp = loadRepoConfig(repoPath);
  try {
    const g = git(repoPath);
    const [branch, remotes, config, status, log] = await Promise.all([
      g.branchLocal(),
      g.getRemotes(true),
      g.listConfig(),
      g.status(),
      g.log().catch(() => ({ total: 0 })),
    ]);

    let originHead = '';
    const remotesSafe = remotes.filter(r => isValidRefName(r.name));
    const remoteNames = remotesSafe.length > 0 ? remotesSafe.map(r => r.name) : ['origin'];
    for (const rName of remoteNames) {
      try {
        originHead = await g.raw(['symbolic-ref', `refs/remotes/${rName}/HEAD`]);
        if (originHead.trim()) break;
      } catch (_) {}
    }

    let gitPlatformInfo = null;
    for (const r of remotes) {
      const url   = r.refs.fetch || r.refs.push || '';
      const found = registry.detect(url, configApp.platforms);
      if (found) {
        gitPlatformInfo = { type: found.type, owner: found.owner, repo: found.repo };
        break;
      }
    }

    const detectedMain = originHead.trim().replace(/^refs\/remotes\/[^/]+\//, '') || null;

    let gitDir = path.join(path.normalize(repoPath), '.git');
    try {
      const gitDirStat = fs.statSync(gitDir);
      if (gitDirStat.isFile()) {
        const content = fs.readFileSync(gitDir, 'utf8').trim();
        const match   = content.match(/^gitdir:\s*(.+)$/m);
        if (match) gitDir = path.resolve(repoPath, match[1].trim());
      }
    } catch (_) {}
    let repoState = null;
    if (fs.existsSync(path.join(gitDir, 'MERGE_HEAD')))            repoState = 'MERGING';
    else if (fs.existsSync(path.join(gitDir, 'rebase-merge')))     repoState = 'REBASING';
    else if (fs.existsSync(path.join(gitDir, 'rebase-apply')))     repoState = 'REBASING';
    else if (fs.existsSync(path.join(gitDir, 'CHERRY_PICK_HEAD'))) repoState = 'CHERRY-PICKING';
    else if (fs.existsSync(path.join(gitDir, 'REVERT_HEAD')))      repoState = 'REVERTING';

    const conflictedFiles = status.conflicted || [];

    res.json({
      currentBranch: branch.current,
      branches: branch.all,
      remotes,
      githubInfo: gitPlatformInfo,
      userName:  config.all['user.name']  || '',
      userEmail: config.all['user.email'] || '',
      ahead:       status.ahead,
      behind:      status.behind,
      tracking:    status.tracking,
      totalCommits: log.total || 0,
      defaultBranch: detectedMain,
      repoState,
      conflictedFiles,
    });
  } catch (e) {
    handleGitError(res, e);
  }
});

router.get('/status', async (req, res) => {
  const { repoPath } = req.query;
  try {
    res.json(await git(repoPath).status());
  } catch (e) {
    handleGitError(res, e);
  }
});

router.get('/files/all', async (req, res) => {
  const { repoPath } = req.query;
  try {
    const g = git(repoPath);
    const [lsOut, status] = await Promise.all([
      g.raw(['ls-files', '--cached', '--others', '--exclude-standard']),
      g.status(),
    ]);
    const statusMap = {};
    for (const f of (status.files || [])) statusMap[f.path] = f;

    const files = lsOut.trim().split('\n').filter(Boolean).map(p => ({
      path: p,
      index:       statusMap[p]?.index       ?? ' ',
      working_dir: statusMap[p]?.working_dir ?? ' ',
    }));
    res.json(files);
  } catch (e) {
    handleGitError(res, e);
  }
});

router.get('/log', async (req, res) => {
  const { repoPath, search, branch } = req.query;
  const cfg = loadRepoConfig(repoPath);
  const limit = req.query.limit || cfg.logLimit || 100;
  try {
    const g   = git(repoPath);
    const SEP = '|||';
    const fmt = `%H${SEP}%P${SEP}%an${SEP}%aI${SEP}%D${SEP}%s`;
    const args = ['log', `--format=${fmt}`, `--max-count=${parseInt(limit)}`];
    if (branch) args.push(branch);
    else        args.push('--all');
    if (search) { args.push('--grep'); args.push(search); }
    if (req.query.file) {
      const allIdx = args.indexOf('--all');
      if (allIdx !== -1) args.splice(allIdx, 1);
      args.push('--follow', '--', req.query.file);
    }

    const raw = await g.raw(args).catch(async err => {
      if (err.message.includes('does not have any commits') || err.message.includes('fatal: bad default revision')) {
        return '';
      }
      if (branch && (err.message.includes('unknown revision') || err.message.includes('ambiguous argument'))) {
        const fallbackArgs = args.filter(a => a !== branch);
        if (!fallbackArgs.includes('--all')) fallbackArgs.splice(2, 0, '--all');
        const fallbackRaw = await g.raw(fallbackArgs).catch(() => '');
        return { _branchNotFound: true, raw: fallbackRaw };
      }
      throw err;
    });
    const branchNotFound = typeof raw === 'object' && raw._branchNotFound;
    const rawStr = branchNotFound ? raw.raw : raw;
    const all = rawStr.trim().split('\n').filter(Boolean).map(line => {
      const parts = line.split(SEP);
      const [hash, parents, author_name, date, refs] = parts;
      const message = parts.slice(5).join(SEP);
      return {
        hash:        hash        || '',
        parents:     parents     ? parents.split(' ').filter(Boolean) : [],
        author_name: author_name || '',
        date:        date        || '',
        refs:        refs        || '',
        message:     message     || '',
      };
    });
    res.json({ all, ...(branchNotFound && { branchNotFound: true }) });
  } catch (e) {
    logger.error('Log error', { msg: e.message });
    handleGitError(res, e);
  }
});

// ─── Reflog ────────────────────────────────────────────────────────────────────

router.get('/reflog', async (req, res) => {
  const { repoPath, limit = 100 } = req.query;
  try {
    const out = await git(repoPath).raw([
      'reflog',
      '--format=%H|%gd|%gs|%aI|%cr',
      `-n`, String(parseInt(limit)),
    ]);
    const entries = out.trim().split('\n').filter(Boolean).map(line => {
      const [hash, ref, subject, date, ago] = line.split('|');
      return { hash: hash?.trim(), ref: ref?.trim(), subject: subject?.trim(), date: date?.trim(), ago: ago?.trim() };
    });
    res.json({ entries });
  } catch (e) {
    handleGitError(res, e);
  }
});

// ─── Blame ────────────────────────────────────────────────────────────────────

router.get('/blame', async (req, res) => {
  const { repoPath, file, rev = 'HEAD' } = req.query;
  if (!file || typeof file !== 'string' || file.startsWith('-')) {
    return res.status(400).json({ error: 'Ruta de archivo inválida' });
  }
  if (rev !== 'HEAD' && !rev.match(/^[0-9a-fA-F]{4,40}$/) && !isValidRefName(rev)) {
    return res.status(400).json({ error: 'Revisión inválida' });
  }
  try {
    const out = await git(repoPath).raw(['blame', '-p', rev, '--', file]);
    // Parse porcelain blame output
    const lines = out.split('\n');
    const blameLines = [];
    let i = 0;
    while (i < lines.length) {
      const headerMatch = lines[i].match(/^([0-9a-f]{40}) \d+ (\d+)/);
      if (headerMatch) {
        const hash = headerMatch[1];
        const lineNum = parseInt(headerMatch[2]);
        let author = '', date = '', summary = '';
        i++;
        while (i < lines.length && !lines[i].startsWith('\t')) {
          if (lines[i].startsWith('author '))           author  = lines[i].slice(7);
          else if (lines[i].startsWith('author-time ')) date    = new Date(parseInt(lines[i].slice(12)) * 1000).toISOString();
          else if (lines[i].startsWith('summary '))     summary = lines[i].slice(8);
          i++;
        }
        const content = lines[i]?.slice(1) ?? '';
        blameLines.push({ hash: hash.slice(0, 8), fullHash: hash, lineNum, author, date, summary, content });
        i++;
      } else {
        i++;
      }
    }
    res.json({ lines: blameLines });
  } catch (e) {
    handleGitError(res, e);
  }
});

// ─── Conflict 3-way editor ────────────────────────────────────────────────────

function parseConflictBlocks(text) {
  const lines  = text.split('\n');
  const blocks = [];
  let mode     = 'common'; // 'common' | 'ours' | 'base' | 'theirs'
  let common   = [];
  let ours     = [];
  let base     = [];
  let theirs   = [];

  const flush = () => {
    if (common.length) { blocks.push({ type: 'common', lines: common }); common = []; }
  };

  for (const line of lines) {
    if (line.startsWith('<<<<<<<')) {
      flush();
      mode = 'ours';
    } else if (line.startsWith('|||||||') && mode === 'ours') {
      mode = 'base';
    } else if (line === '=======' && (mode === 'ours' || mode === 'base')) {
      mode = 'theirs';
    } else if (line.startsWith('>>>>>>>') && mode === 'theirs') {
      blocks.push({ type: 'conflict', ours: ours.join('\n'), base: base.join('\n'), theirs: theirs.join('\n') });
      ours = []; base = []; theirs = [];
      mode = 'common';
    } else {
      if (mode === 'common') common.push(line);
      else if (mode === 'ours') ours.push(line);
      else if (mode === 'base') base.push(line);
      else if (mode === 'theirs') theirs.push(line);
    }
  }
  if (common.length) blocks.push({ type: 'common', lines: common });
  return blocks;
}

router.get('/conflict/content', (req, res) => {
  const { repoPath, file } = req.query;
  if (!file || typeof file !== 'string' || file.startsWith('-')) {
    return res.status(400).json({ error: 'Ruta de archivo inválida' });
  }
  try {
    const absPath = path.resolve(repoPath, file);
    if (!absPath.startsWith(path.resolve(repoPath))) return res.status(400).json({ error: 'Ruta fuera del repositorio' });
    const raw    = fs.readFileSync(absPath, 'utf8');
    const blocks = parseConflictBlocks(raw);
    res.json({ blocks, hasConflicts: blocks.some(b => b.type === 'conflict') });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/conflict/resolve', async (req, res) => {
  const { repoPath, file, content } = req.body;
  if (!file || typeof file !== 'string' || file.startsWith('-')) {
    return res.status(400).json({ error: 'Ruta de archivo inválida' });
  }
  try {
    const absPath = path.resolve(repoPath, file);
    if (!absPath.startsWith(path.resolve(repoPath))) return res.status(400).json({ error: 'Ruta fuera del repositorio' });
    fs.writeFileSync(absPath, content, 'utf8');
    await git(repoPath).add(file);
    res.json({ success: true });
  } catch (e) {
    handleGitError(res, e);
  }
});

module.exports = router;

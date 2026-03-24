const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const { exec } = require('child_process');
const simpleGit  = require('simple-git');
const { git }    = require('../lib/git');
const { loadConfig } = require('../lib/config');
const registry = require('../lib/platforms');

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
      console.error('[repo/check] checkIsRepo falló:', gitErr.message);
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
      console.error('[repo/check] git config/remotes falló:', gitErr.message);
    }

    res.json({
      isRepo: true,
      configComplete: hasName && hasEmail && hasRemote,
      missingConfig: { name: !hasName, email: !hasEmail, remote: !hasRemote },
    });
  } catch (e) {
    console.error('[repo/check] error:', e.message);
    res.json({ isRepo: false, error: e.message });
  }
});

router.post('/init', async (req, res) => {
  const { repoPath } = req.body;
  try {
    await git(repoPath).init();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/clone', async (req, res) => {
  const { remoteUrl, localPath } = req.body;
  try {
    await simpleGit().clone(remoteUrl, localPath);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Repo Info ─────────────────────────────────────────────────────────────────

router.get('/info', async (req, res) => {
  const { repoPath } = req.query;
  const configApp = loadConfig();
  try {
    const g = git(repoPath);
    const [branch, remotes, config, status, log] = await Promise.all([
      g.branchLocal(),
      g.getRemotes(true),
      g.listConfig(),
      g.status(),
      g.log().catch(() => ({ total: 0 })),
    ]);

    // Detect default branch from various possible remotes
    let originHead = '';
    const remoteNames = remotes.length > 0 ? remotes.map(r => r.name) : ['origin'];
    for (const rName of remoteNames) {
      try {
        originHead = await g.raw(['symbolic-ref', `refs/remotes/${rName}/HEAD`]);
        if (originHead.trim()) break;
      } catch (_) {}
    }

    let gitPlatformInfo = null;
    if (remotes.length > 0) {
      const url    = remotes[0].refs.fetch || remotes[0].refs.push || '';
      const found  = registry.detect(url, configApp.platforms);
      if (found) gitPlatformInfo = { type: found.type, owner: found.owner, repo: found.repo };
    }

    // Extract branch name from "refs/remotes/origin/main" → "main"
    const detectedMain = originHead.trim().replace(/^refs\/remotes\/[^/]+\//, '') || null;

    // Detectar estado especial del repo (MERGING, REBASING, etc.)
    // Si .git es un archivo (worktree/submódulo), resolvemos la ruta real del gitdir
    let gitDir = path.join(path.normalize(repoPath), '.git');
    try {
      const gitDirStat = fs.statSync(gitDir);
      if (gitDirStat.isFile()) {
        // Worktree: el archivo contiene "gitdir: /ruta/real"
        const content = fs.readFileSync(gitDir, 'utf8').trim();
        const match   = content.match(/^gitdir:\s*(.+)$/m);
        if (match) gitDir = path.resolve(repoPath, match[1].trim());
      }
    } catch (_) {}
    let repoState  = null;
    if (fs.existsSync(path.join(gitDir, 'MERGE_HEAD')))            repoState = 'MERGING';
    else if (fs.existsSync(path.join(gitDir, 'rebase-merge')))     repoState = 'REBASING';
    else if (fs.existsSync(path.join(gitDir, 'rebase-apply')))     repoState = 'REBASING';
    else if (fs.existsSync(path.join(gitDir, 'CHERRY_PICK_HEAD'))) repoState = 'CHERRY-PICKING';
    else if (fs.existsSync(path.join(gitDir, 'REVERT_HEAD')))      repoState = 'REVERTING';

    // Archivos en conflicto
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
    res.status(500).json({ error: e.message });
  }
});

router.get('/status', async (req, res) => {
  const { repoPath } = req.query;
  try {
    res.json(await git(repoPath).status());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/log', async (req, res) => {
  const cfg = loadConfig();
  const { repoPath, search, branch } = req.query;
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
      // Remove --all if it was added (file history doesn't need --all)
      const allIdx = args.indexOf('--all');
      if (allIdx !== -1) args.splice(allIdx, 1);
      args.push('--follow', '--', req.query.file);
    }

    const raw = await g.raw(args).catch(async err => {
      // Repo vacío o sin commits todavía
      if (err.message.includes('does not have any commits') || err.message.includes('fatal: bad default revision')) {
        return '';
      }
      // La rama solicitada ya no existe localmente (borrada, renombrada, etc.) — reintentar sin filtro de rama
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
    console.error('Log error:', e);
    res.status(500).json({ error: e.message });
  }
});

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
    res.status(500).json({ error: e.message });
  }
});

router.get('/commit/files', async (req, res) => {
  const { repoPath, hash } = req.query;
  try {
    const out = await git(repoPath).raw(['diff-tree', '--no-commit-id', '-r', '--name-status', hash]);
    const files = out.trim().split('\n').filter(Boolean).map(line => {
      const [status, ...rest] = line.split('\t');
      const oldPath = rest[0] || '';
      const newPath = rest[1] || oldPath;
      return { status: status[0], path: newPath, oldPath: status[0] === 'R' ? oldPath : null };
    });
    res.json({ files });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/commit/diff', async (req, res) => {
  const { repoPath, hash, file } = req.query;
  try {
    res.json({ diff: await git(repoPath).raw(['show', `${hash}`, '--', file]) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/commit/diff-range', async (req, res) => {
  const { repoPath, hash1, hash2, file } = req.query;
  try {
    res.json({ diff: await git(repoPath).raw(['diff', hash1, hash2, '--', file]) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Hunk Staging ──────────────────────────────────────────────────────────────

router.post('/stage-hunk', async (req, res) => {
  const { repoPath, patch, reverse } = req.body;
  const tmpId = require('crypto').randomBytes(8).toString('hex');
  const tmp = path.join(require('os').tmpdir(), `gvm-hunk-${tmpId}.patch`);
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
    res.status(500).json({ error: e.message });
  }
});

// ─── Staging & Commits ─────────────────────────────────────────────────────────

router.post('/stage', async (req, res) => {
  const { repoPath, files } = req.body;
  try {
    const g = git(repoPath);
    if (files === 'all' || (Array.isArray(files) && files[0] === '.')) {
      await g.add('.');
    } else {
      await g.add(Array.isArray(files) ? files : [files]);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/unstage', async (req, res) => {
  const { repoPath, files } = req.body;
  try {
    const g = git(repoPath);
    const hasHead = await g.raw(['rev-parse', '--verify', 'HEAD']).then(() => true).catch(() => false);
    if (files === 'all') {
      if (hasHead) await g.reset(['HEAD']);
      else         await g.raw(['rm', '--cached', '-r', '.']);
    } else {
      const fileList = Array.isArray(files) ? files : [files];
      if (hasHead) await g.reset(['HEAD', '--', ...fileList]);
      else         await g.raw(['rm', '--cached', ...fileList]);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/discard', async (req, res) => {
  const { repoPath, files } = req.body;
  try {
    const g = git(repoPath);
    if (files === 'all') {
      await g.checkout(['.']);
    } else {
      const fileList = Array.isArray(files) ? files : [files];
      await g.checkout(['--', ...fileList]);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/delete-file', async (req, res) => {
  const { repoPath, file, isUntracked } = req.body;
  try {
    const fullPath = path.join(repoPath, file);
    if (isUntracked) {
      if (fs.existsSync(fullPath)) {
        fs.rmSync(fullPath, { recursive: true, force: true });
      }
    } else {
      await git(repoPath).rm([file, '-f']);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/commit', async (req, res) => {
  const { repoPath, message, amend } = req.body;
  const opts = amend ? ['--amend'] : [];
  const tryCommit = () => git(repoPath).commit(message, opts);
  try {
    res.json({ success: true, result: await tryCommit() });
  } catch (e) {
    // Si hay un lock file (secuela de un push/fetch reciente), esperar y reintentar una vez
    if (e.message.includes('lock') || e.message.includes('index.lock')) {
      await new Promise(r => setTimeout(r, 1200));
      try {
        res.json({ success: true, result: await tryCommit() });
      } catch (e2) {
        res.status(500).json({ error: e2.message });
      }
    } else {
      res.status(500).json({ error: e.message });
    }
  }
});

router.post('/commit/revert', async (req, res) => {
  const { repoPath, hash } = req.body;
  try {
    await git(repoPath).revert([hash, '--no-edit']);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Remote Operations ─────────────────────────────────────────────────────────

// Configura parámetros HTTP de git para pushes confiables en conexiones lentas
async function _configureHttpForPush(g) {
  try {
    await g.addConfig('http.postBuffer', '524288000');
    await g.addConfig('http.lowSpeedLimit', '0');
    await g.addConfig('http.lowSpeedTime', '999');
  } catch (_) { /* no crítico */ }
}

// Obtiene lista de commits locales no presentes en el remote (en orden cronológico)
async function _getAheadCommits(g, remote, branch, isFirstPush) {
  try {
    const ref = isFirstPush ? 'HEAD' : `${remote}/${branch}..HEAD`;
    const out = await g.raw(['rev-list', '--reverse', ref]);
    return out.trim().split('\n').filter(Boolean);
  } catch (_) { return []; }
}

router.post('/push', async (req, res) => {
  const { repoPath, remote = 'origin', branch, setUpstream = false, batched = false, batchSize = 20 } = req.body;
  if (!branch) return res.status(400).json({ error: 'Nombre de rama vacío. Asegúrate de tener una rama activa antes de hacer push.' });
  const g = git(repoPath);
  try {
    await _configureHttpForPush(g);

    if (batched) {
      // Push incremental: envía lotes de N commits para no saturar la conexión
      const isFirstPush = !!setUpstream;
      const commits = await _getAheadCommits(g, remote, branch, isFirstPush);

      if (commits.length === 0) {
        // Nada que subir o no se pudo calcular — push normal
        const args = ['push'];
        if (setUpstream) args.push('-u');
        args.push(remote, branch);
        await g.raw(args);
      } else {
        const batches = [];
        for (let i = 0; i < commits.length; i += batchSize) {
          batches.push(commits[Math.min(i + batchSize - 1, commits.length - 1)]);
        }
        for (let i = 0; i < batches.length; i++) {
          const isLast = i === batches.length - 1;
          const args   = ['push'];
          if (isLast && setUpstream) args.push('-u');
          args.push(remote, `${batches[i]}:refs/heads/${branch}`);
          await g.raw(args);
        }
      }
      return res.json({ success: true, batches: Math.ceil((commits.length || 1) / batchSize) });
    }

    // Push normal
    const args = ['push'];
    if (setUpstream) args.push('-u');
    args.push(remote, branch);
    res.json({ success: true, result: await g.raw(args) });
  } catch (e) {
    let remoteUrl = 'No se pudo leer.';
    try {
      const remotes = await g.getRemotes(true);
      const origin  = remotes.find(r => r.name === remote);
      if (origin) remoteUrl = origin.refs.push;
    } catch (e2) {
      remoteUrl = `Error al leer: ${e2.message}`;
    }
    res.status(500).json({ error: `Falló el push. Error: ${e.message}. \n\n[Debug Info] URL del remote '${remote}' que se intentó usar: '${remoteUrl}'` });
  }
});

router.post('/pull', async (req, res) => {
  const { repoPath, remote = 'origin', branch } = req.body;
  const cfg = loadConfig();
  try {
    const opts = {};
    if (cfg.rebaseOnPull) opts['--rebase'] = null;
    if (cfg.autoStash)    opts['--autostash'] = null;
    res.json({ success: true, result: await git(repoPath).pull(remote, branch, opts) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/fetch', async (req, res) => {
  const { repoPath } = req.body;
  try {
    await git(repoPath).fetch(['--all', '--prune']);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/push-production', async (req, res) => {
  const { repoPath, productionBranch, mergeFrom, remote = 'origin' } = req.body;
  const g = git(repoPath);
  let originalBranch = null;
  try {
    const status = await g.status();
    if (status.staged.length > 0 || status.modified.length > 0) {
      return res.status(400).json({ error: 'Tienes cambios sin commitear. Haz commit primero.' });
    }
    originalBranch = status.current;
    await g.checkout(productionBranch);
    if (mergeFrom && mergeFrom !== productionBranch) {
      await g.merge([mergeFrom, '--no-ff', '-m', `Merge ${mergeFrom} into ${productionBranch}`]);
    }
    await g.raw(['push', remote, productionBranch]);
    if (originalBranch && originalBranch !== productionBranch) await g.checkout(originalBranch);
    res.json({ success: true, message: `Push a "${productionBranch}" exitoso` });
  } catch (e) {
    let remoteUrl = 'No se pudo leer.';
    try {
      const remotes = await g.getRemotes(true);
      const origin  = remotes.find(r => r.name === remote);
      if (origin) remoteUrl = origin.refs.push;
    } catch (e2) { remoteUrl = `Error al leer: ${e2.message}`; }
    if (originalBranch) { try { await g.checkout(originalBranch); } catch (_) {} }
    res.status(500).json({ error: `Falló el push. Error: ${e.message}. \n\n[Debug Info] URL del remote '${remote}' que se intentó usar: '${remoteUrl}'. \n MergeFrom (enviado): '${req.body.mergeFrom}', ProductionBranch (enviado): '${req.body.productionBranch}'` });
  }
});

// ─── Git Config & Remotes ──────────────────────────────────────────────────────

router.post('/config/set', async (req, res) => {
  const { repoPath, key, value, global: isGlobal } = req.body;
  try {
    if (isGlobal) {
      await simpleGit().addConfig(key, value, false, 'global');
    } else {
      if (!repoPath) return res.status(400).json({ error: 'Para configurar localmente, primero debe abrir un repositorio.' });
      await git(repoPath).addConfig(key, value);
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/remote/add', async (req, res) => {
  const { repoPath, name = 'origin', url } = req.body;
  try {
    await git(repoPath).addRemote(name, url);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/remote/set-url', async (req, res) => {
  const { repoPath, name, url } = req.body;
  try {
    await git(repoPath).remote(['set-url', name, url]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── .gitignore ────────────────────────────────────────────────────────────────

router.get('/gitignore', (req, res) => {
  const { repoPath } = req.query;
  const filePath = path.join(path.normalize(repoPath), '.gitignore');
  try {
    const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    res.json({ content });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/gitignore', (req, res) => {
  const { repoPath, content } = req.body;
  const filePath = path.join(path.normalize(repoPath), '.gitignore');
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/untrack', async (req, res) => {
  const { repoPath, files } = req.body;
  try {
    await git(repoPath).raw(['rm', '--cached', '--', ...files]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Reset ─────────────────────────────────────────────────────────────────────

router.post('/reset', async (req, res) => {
  const { repoPath, hash, mode = 'mixed' } = req.body;
  if (!['soft', 'mixed', 'hard'].includes(mode)) return res.status(400).json({ error: 'Modo inválido' });
  if (hash && (hash.startsWith('-') || !/^[0-9a-fA-F]{4,40}$/.test(hash))) return res.status(400).json({ error: 'Hash inválido' });
  try {
    const args = [`--${mode}`];
    if (hash) args.push(hash);
    await git(repoPath).reset(args);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Remote Management ─────────────────────────────────────────────────────────

router.post('/remote/delete', async (req, res) => {
  const { repoPath, name } = req.body;
  if (!name || name.startsWith('-')) return res.status(400).json({ error: 'Nombre de remoto inválido' });
  try {
    await git(repoPath).removeRemote(name);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/remote/rename', async (req, res) => {
  const { repoPath, oldName, newName } = req.body;
  if (!oldName || oldName.startsWith('-')) return res.status(400).json({ error: 'Nombre de remoto inválido' });
  if (!newName || newName.startsWith('-') || /\s/.test(newName)) return res.status(400).json({ error: 'Nombre nuevo inválido' });
  try {
    await git(repoPath).raw(['remote', 'rename', oldName, newName]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Conflict Resolution ────────────────────────────────────────────────────────

router.post('/checkout-conflict', async (req, res) => {
  const { repoPath, file, side } = req.body; // side: 'ours' | 'theirs'
  if (!['ours', 'theirs'].includes(side)) return res.status(400).json({ error: 'Lado inválido' });
  if (!file || typeof file !== 'string' || file.startsWith('-')) return res.status(400).json({ error: 'Ruta inválida' });
  try {
    const g = git(repoPath);
    await g.raw(['checkout', `--${side}`, '--', file]);
    await g.raw(['add', '--', file]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── File System ───────────────────────────────────────────────────────────────

router.post('/open-file', (req, res) => {
  const { repoPath, file } = req.body;
  // Normalizar y unir rutas de forma segura
  const normalizedRepo = path.normalize(repoPath);
  const fullPath = path.join(normalizedRepo, file);
  
  try {
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Archivo no encontrado' });
    
    // Escapar comillas dobles para prevenir inyección en el comando shell
    const escapedPath = fullPath.replace(/"/g, '\\"');
    
    if (process.platform === 'win32')      exec(`start "" "${escapedPath}"`);
    else if (process.platform === 'darwin') exec(`open "${escapedPath}"`);
    else                                    exec(`xdg-open "${escapedPath}"`);
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

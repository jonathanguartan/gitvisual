'use strict';
const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const { spawn } = require('child_process');
const simpleGit = require('simple-git');
const { git }   = require('../lib/git');
const { loadRepoConfig } = require('../lib/config');
const { handleGitError } = require('../lib/git-errors');
const { isValidRefName } = require('../lib/validation');
const logger = require('../lib/logger');

async function _configureHttpForPush(g) {
  try {
    await g.addConfig('http.postBuffer', '524288000');
    await g.addConfig('http.lowSpeedLimit', '0');
    await g.addConfig('http.lowSpeedTime', '999');
  } catch (_) {}
}

async function _getAheadCommits(g, remote, branch, isFirstPush) {
  try {
    const ref = isFirstPush ? 'HEAD' : `${remote}/${branch}..HEAD`;
    const out = await g.raw(['rev-list', '--reverse', ref]);
    return out.trim().split('\n').filter(Boolean);
  } catch (_) { return []; }
}

router.post('/push', async (req, res) => {
  const { repoPath, remote = 'origin', branch, setUpstream = false, batched = false, batchSize = 20, skipMergeCheck = false } = req.body;
  if (!branch || !isValidRefName(branch)) return res.status(400).json({ error: 'Nombre de rama inválido. Asegúrate de tener una rama activa antes de hacer push.' });
  if (!isValidRefName(remote)) return res.status(400).json({ error: 'Nombre de remoto inválido.' });

  const g = git(repoPath);
  try {
    await _configureHttpForPush(g);

    // Verificar que la rama tenga al menos un commit antes de intentar push
    const hasCommit = await g.raw(['rev-parse', '--verify', branch]).then(() => true).catch(() => false);
    if (!hasCommit) {
      return res.status(400).json({ error: `La rama "${branch}" no tiene commits aún. Haz al menos un commit antes de hacer push.` });
    }

    // Advertir si la rama ya fue mergeada en main/master.
    // Solo aplica si la rama fue publicada antes: setUpstream=true indica primer push,
    // y aunque refs/remotes exista localmente (por fetch), no debe activar el chequeo.
    // Se omite para ramas principales (main/master) ya que son trivialmente ancestro de sí mismas.
    const cfg = loadRepoConfig(repoPath);
    const mainBranches = new Set(['main', 'master', cfg.mainBranch].filter(Boolean));
    if (!skipMergeCheck && !setUpstream && !mainBranches.has(branch)) {
      const wasPushed = await g.raw(['rev-parse', '--verify', `refs/remotes/${remote}/${branch}`]).then(() => true).catch(() => false);
      if (wasPushed) {
        const remoteRef = `refs/remotes/${remote}/${branch}`;
        for (const target of [`${remote}/main`, `${remote}/master`]) {
          try {
            await g.raw(['merge-base', '--is-ancestor', remoteRef, target]);
            const base = target.replace(`${remote}/`, '');
            return res.json({ merged: true, warning: `La rama "${branch}" ya fue mergeada en "${base}". ¿Hacer push de todas formas?` });
          } catch (_) {}
        }
      }
    }

    if (batched) {
      const isFirstPush = !!setUpstream;
      const commits = await _getAheadCommits(g, remote, branch, isFirstPush);

      if (commits.length === 0) {
        await g.raw(['push', remote, branch]);
      } else {
        const batches = [];
        for (let i = 0; i < commits.length; i += batchSize) {
          batches.push(commits[Math.min(i + batchSize - 1, commits.length - 1)]);
        }
        for (let i = 0; i < batches.length; i++) {
          await g.raw(['push', remote, `${batches[i]}:refs/heads/${branch}`]);
        }
      }

      // git push -u no funciona cuando el refspec local es un hash (no una rama),
      // así que el tracking se asigna explícitamente después de todos los batches.
      if (setUpstream) {
        try { await g.raw(['branch', '--set-upstream-to', `${remote}/${branch}`, branch]); } catch (_) {}
      }

      return res.json({ success: true, batches: Math.ceil((commits.length || 1) / batchSize) });
    }

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
    } catch (_) {}
    handleGitError(res, e, { debug: `URL del remote '${remote}': ${remoteUrl}` });
  }
});

router.post('/pull', async (req, res) => {
  const { repoPath, remote = 'origin', branch } = req.body;
  if (branch && !isValidRefName(branch)) return res.status(400).json({ error: 'Nombre de rama inválido.' });
  if (!isValidRefName(remote)) return res.status(400).json({ error: 'Nombre de remoto inválido.' });

  const cfg = loadRepoConfig(repoPath);
  try {
    const opts = {};
    if (cfg.rebaseOnPull) opts['--rebase'] = null;
    if (cfg.autoStash)    opts['--autostash'] = null;
    res.json({ success: true, result: await git(repoPath).pull(remote, branch, opts) });
  } catch (e) {
    handleGitError(res, e);
  }
});

router.post('/fetch', async (req, res) => {
  const { repoPath } = req.body;
  try {
    await git(repoPath).fetch(['--all', '--prune']);
    res.json({ success: true });
  } catch (e) {
    handleGitError(res, e);
  }
});

router.post('/push-production', async (req, res) => {
  const { repoPath, productionBranch, mergeFrom, remote = 'origin' } = req.body;
  if (!isValidRefName(productionBranch) || !isValidRefName(remote))
    return res.status(400).json({ error: 'Parámetros inválidos' });
  if (mergeFrom && !isValidRefName(mergeFrom))
    return res.status(400).json({ error: 'Nombre de rama origen inválido' });

  const g = git(repoPath);
  let originalBranch = null;
  try {
    // Verificar que la rama destino tenga al menos un commit
    const hasCommit = await g.raw(['rev-parse', '--verify', productionBranch]).then(() => true).catch(() => false);
    if (!hasCommit) {
      return res.status(400).json({ error: `La rama "${productionBranch}" no tiene commits aún. Haz al menos un commit antes de publicar.` });
    }

    const status = await g.status();
    if (status.staged.length > 0 || status.modified.length > 0) {
      return res.status(400).json({ error: 'Tienes cambios sin commitear. Haz commit primero.' });
    }
    originalBranch = status.current;
    await g.checkout(productionBranch);

    // Guardamos el HEAD antes del merge para poder hacer rollback si falla el push
    let preMergeHead = null;
    if (mergeFrom && mergeFrom !== productionBranch) {
      preMergeHead = (await g.raw(['rev-parse', 'HEAD'])).trim();
      await g.merge([mergeFrom, '--no-ff', '-m', `Merge ${mergeFrom} into ${productionBranch}`]);
    }

    try {
      await g.raw(['push', remote, productionBranch]);
    } catch (pushErr) {
      // Rollback: deshacer el merge que se hizo localmente
      if (preMergeHead) {
        try { await g.raw(['reset', '--hard', preMergeHead]); } catch (_) {}
      }
      throw pushErr;
    }

    if (originalBranch && originalBranch !== productionBranch) await g.checkout(originalBranch);
    res.json({ success: true, message: `Push a "${productionBranch}" exitoso` });
  } catch (e) {
    let remoteUrl = 'No se pudo leer.';
    try {
      const remotes = await g.getRemotes(true);
      const origin  = remotes.find(r => r.name === remote);
      if (origin) remoteUrl = origin.refs.push;
    } catch (_) {}
    if (originalBranch) { try { await g.checkout(originalBranch); } catch (_) {} }
    handleGitError(res, e, { debug: `Remote '${remote}': ${remoteUrl} | mergeFrom: '${req.body.mergeFrom}' | productionBranch: '${req.body.productionBranch}'` });
  }
});

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
    handleGitError(res, e);
  }
});

router.post('/remote/add', async (req, res) => {
  const { repoPath, name = 'origin', url } = req.body;
  try {
    await git(repoPath).addRemote(name, url);
    res.json({ success: true });
  } catch (e) {
    handleGitError(res, e);
  }
});

router.post('/remote/set-url', async (req, res) => {
  const { repoPath, name, url } = req.body;
  try {
    await git(repoPath).remote(['set-url', name, url]);
    res.json({ success: true });
  } catch (e) {
    handleGitError(res, e);
  }
});

router.post('/remote/delete', async (req, res) => {
  const { repoPath, name } = req.body;
  if (!isValidRefName(name)) return res.status(400).json({ error: 'Nombre de remoto inválido' });
  try {
    await git(repoPath).removeRemote(name);
    res.json({ success: true });
  } catch (e) {
    handleGitError(res, e);
  }
});

router.post('/remote/rename', async (req, res) => {
  const { repoPath, oldName, newName } = req.body;
  if (!isValidRefName(oldName) || !isValidRefName(newName)) return res.status(400).json({ error: 'Nombre de remoto inválido' });
  if (/\s/.test(newName)) return res.status(400).json({ error: 'El nuevo nombre no puede contener espacios' });
  try {
    await git(repoPath).raw(['remote', 'rename', oldName, newName]);
    res.json({ success: true });
  } catch (e) {
    handleGitError(res, e);
  }
});

router.post('/open-folder', (req, res) => {
  const { repoPath } = req.body;
  if (!repoPath) return res.status(400).json({ error: 'Ruta requerida' });
  const dir = path.normalize(repoPath);
  try {
    if (process.platform === 'win32') {
      spawn('explorer', [dir], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [dir], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [dir], { detached: true, stdio: 'ignore' }).unref();
    }
    res.json({ success: true });
  } catch (e) {
    handleGitError(res, e);
  }
});

router.post('/open-terminal', (req, res) => {
  const { repoPath } = req.body;
  if (!repoPath) return res.status(400).json({ error: 'Ruta requerida' });
  const dir = path.normalize(repoPath);
  try {
    if (process.platform === 'win32') {
      const gitBashPaths = [
        'C:\\Program Files\\Git\\git-bash.exe',
        'C:\\Program Files (x86)\\Git\\git-bash.exe',
      ];
      const gitBash = gitBashPaths.find(p => fs.existsSync(p));
      if (gitBash) {
        spawn(gitBash, [`--cd=${dir}`], { detached: true, stdio: 'ignore' }).unref();
      } else {
        spawn('cmd', ['/c', 'start', '', '/D', dir, 'cmd.exe'], { detached: true, stdio: 'ignore' }).unref();
      }
    } else if (process.platform === 'darwin') {
      spawn('open', ['-a', 'Terminal', dir], { detached: true, stdio: 'ignore' }).unref();
    } else {
      const term = process.env.TERMINAL || 'xterm';
      spawn(term, [], { detached: true, stdio: 'ignore', cwd: dir }).unref();
    }
    res.json({ success: true });
  } catch (e) {
    handleGitError(res, e);
  }
});

router.post('/open-file', (req, res) => {
  const { repoPath, file } = req.body;
  const normalizedRepo = path.normalize(repoPath);
  const fullPath = path.join(normalizedRepo, file);

  try {
    if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Archivo no encontrado' });
    if (!fullPath.startsWith(normalizedRepo)) {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '""', fullPath], { detached: true, stdio: 'ignore' }).unref();
    } else if (process.platform === 'darwin') {
      spawn('open', [fullPath], { detached: true, stdio: 'ignore' }).unref();
    } else {
      spawn('xdg-open', [fullPath], { detached: true, stdio: 'ignore' }).unref();
    }

    res.json({ success: true });
  } catch (e) {
    handleGitError(res, e);
  }
});

module.exports = router;

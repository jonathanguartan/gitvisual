const fs     = require('fs');
const path   = require('path');
const router = require('express').Router();
const { git }            = require('../lib/git');
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

// Git no puede ni empezar: ficheros locales bloquean la aplicación del stash
function isPreventedError(msg) {
  return msg.includes('would be overwritten') || msg.includes('already exists, no checkout');
}

// Git aplicó lo que pudo pero dejó marcadores de conflicto (<<<) en los archivos
function isMergeConflict(msg) {
  return msg.includes('CONFLICT') || msg.includes('Merge conflict');
}

// Extrae la lista de archivos del mensaje de error "would be overwritten".
// Git usa varios formatos según la versión y el tipo de conflicto:
//   Formato 1 — lista bajo encabezado terminado en ':':
//     "Your local changes to the following files would be overwritten by merge:\n\tfile.js"
//   Formato 2 — inline con comillas simples:
//     "Entry 'file.js' would be overwritten by merge."
function parsePreventedFiles(msg) {
  const files = new Set();
  const lines = msg.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (!/would be overwritten|already exists/.test(lines[i])) continue;
    for (let j = i + 1; j < lines.length; j++) {
      const trimmed = lines[j].trim();
      if (!trimmed) continue;
      if (/^(Please|Aborting|hint:|Merge |Changes |nothing )/.test(trimmed)) break;
      if (/^\(use /.test(trimmed)) continue;
      const filePath = trimmed.replace(/^(modified|added|deleted|renamed|copied|unmerged|untracked):\s+/i, '').trim();
      if (filePath && !filePath.startsWith('(')) files.add(filePath);
    }
    break;
  }

  for (const m of msg.matchAll(/'([^']+)' would be overwritten/g)) files.add(m[1]);

  return [...files];
}

// Incrementa el índice numérico de un ref de stash: stash@{N} → stash@{N+1}
function shiftRef(ref) {
  if (!ref) return 'stash@{1}';
  return ref.replace(/\{(\d+)\}/, (_, n) => `{${Number.parseInt(n, 10) + 1}}`);
}

// Compara el contenido de cada archivo bloqueado entre el stash y el working tree.
// Devuelve { identical: [...], different: [...] }.
// Los archivos que no se pueden leer se clasifican como "different" (seguro por defecto).
async function classifyBlockedFiles(repoPath, ref, files) {
  const identical = [];
  const different = [];
  const normalize = s => s.replace(/\r\n/g, '\n');

  for (const file of files) {
    try {
      const stashContent  = await git(repoPath).show([`${ref}:${file}`]);
      const workingContent = fs.readFileSync(path.join(repoPath, file), 'utf8');
      (normalize(stashContent) === normalize(workingContent) ? identical : different).push(file);
    } catch {
      different.push(file);
    }
  }

  return { identical, different };
}

// Construye la respuesta "prevented" con clasificación de archivos bloqueados.
async function preventedResponse(repoPath, ref, errMsg) {
  const files = parsePreventedFiles(errMsg);
  const { identical, different } = files.length
    ? await classifyBlockedFiles(repoPath, ref || 'stash@{0}', files)
    : { identical: [], different: [] };
  return { conflict: true, type: 'prevented', files, identical, different, rawMsg: errMsg };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

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

router.post('/stash/pop', async (req, res) => {
  const { repoPath, ref, autoStash, discardFiles } = req.body;
  try {
    if (discardFiles?.length) {
      for (const file of discardFiles) {
        await git(repoPath).checkout(['--', file]);
      }
    }
    if (autoStash) {
      const out = await git(repoPath).stash(['push', '--include-untracked', '-m', `Auto-stash antes de aplicar ${ref || 'stash'}`]);
      const didStash = !out.includes('No local changes to save');
      const target   = didStash ? shiftRef(ref) : (ref || 'stash@{0}');
      try {
        await git(repoPath).stash(['pop', target]);
      } catch (applyErr) {
        if (isMergeConflict(applyErr.message)) return res.json({ conflict: true, type: 'merge' });
        throw applyErr;
      }
    } else {
      await git(repoPath).stash(ref ? ['pop', ref] : ['pop']);
    }
    res.json({ success: true });
  } catch (e) {
    if (!autoStash && isMergeConflict(e.message))
      return res.json({ conflict: true, type: 'merge' });
    if (!autoStash && isPreventedError(e.message))
      return res.json(await preventedResponse(repoPath, ref, e.message));
    handleGitError(res, e);
  }
});

router.post('/stash/apply', async (req, res) => {
  const { repoPath, ref, autoStash, discardFiles } = req.body;
  try {
    if (discardFiles?.length) {
      for (const file of discardFiles) {
        await git(repoPath).checkout(['--', file]);
      }
    }
    if (autoStash) {
      const out = await git(repoPath).stash(['push', '--include-untracked', '-m', `Auto-stash antes de aplicar ${ref || 'stash'}`]);
      const didStash = !out.includes('No local changes to save');
      const target   = didStash ? shiftRef(ref) : (ref || 'stash@{0}');
      try {
        await git(repoPath).stash(['apply', target]);
      } catch (applyErr) {
        if (isMergeConflict(applyErr.message)) return res.json({ conflict: true, type: 'merge' });
        throw applyErr;
      }
    } else {
      await git(repoPath).stash(ref ? ['apply', ref] : ['apply']);
    }
    res.json({ success: true });
  } catch (e) {
    if (!autoStash && isMergeConflict(e.message))
      return res.json({ conflict: true, type: 'merge' });
    if (!autoStash && isPreventedError(e.message))
      return res.json(await preventedResponse(repoPath, ref, e.message));
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

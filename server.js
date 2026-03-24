const express = require('express');
const path    = require('path');
const fs      = require('fs');
const { exec } = require('child_process');

const app  = express();
const PORT = process.env.PORT || 3333;

// ─── Git PATH Setup ─────────────────────────────────────────────────────────────
// Node.js puede no heredar el PATH completo del sistema. Si git no está disponible,
// lo buscamos en las rutas comunes de Windows y lo añadimos al PATH del proceso.
function ensureGitInPath() {
  const gitDirs = [
    'C:\\Program Files\\Git\\cmd',
    'C:\\Program Files\\Git\\bin',
    'C:\\Program Files (x86)\\Git\\cmd',
    'C:\\Program Files (x86)\\Git\\bin',
    (process.env.LOCALAPPDATA || '') + '\\Programs\\Git\\cmd',
  ];
  for (const dir of gitDirs) {
    try {
      if (fs.existsSync(dir) && !process.env.PATH.includes(dir)) {
        process.env.PATH = dir + ';' + process.env.PATH;
        console.log(`[git] Añadido al PATH: ${dir}`);
        return;
      }
    } catch (_) {}
  }
}
ensureGitInPath();

// ─── Middleware ──────────────────────────────────────────────────────────────

// Valida que el repoPath esté presente y sea un string.
// Esto evita que las rutas intenten operar en el directorio raíz del servidor.
function validateRepoPath(req, res, next) {
  const repoPath = req.query.repoPath || req.body.repoPath;
  if (!repoPath || typeof repoPath !== 'string' || repoPath.trim() === '') {
    return res.status(400).json({ error: 'Falta la ruta del repositorio (repoPath)' });
  }
  next();
}

app.use(require('cors')());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/hljs', express.static(path.join(__dirname, 'node_modules/highlight.js')));

// ─── Routes ────────────────────────────────────────────────────────────────────

app.use('/api/config', require('./routes/config'));
app.use('/api/repo',   validateRepoPath, require('./routes/repo'));
app.use('/api/repo',   validateRepoPath, require('./routes/branches'));
app.use('/api/repo',   validateRepoPath, require('./routes/tags'));
app.use('/api/repo',   validateRepoPath, require('./routes/stash'));
app.use('/api/repo',   validateRepoPath, require('./routes/recover'));
app.use('/api/pr',     require('./routes/pr')); // No requiere repoPath — usa owner/repo/type
app.use('/api/fs',     require('./routes/fs')); // No requiere repoPath para listar unidades/carpetas


// ─── Start ─────────────────────────────────────────────────────────────────────

const server = app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log('\n┌─────────────────────────────────────────┐');
  console.log(`│  Git Visual Manager — ${url}  │`);
  console.log('└─────────────────────────────────────────┘\n');

  // No abrir browser si corremos dentro de Electron (él abre su propia ventana)
  if (!process.versions.electron) {
    const handleError = (err) => { if (err) console.error(`[browser] No se pudo abrir automáticamente: ${err.message}`); };
    if (process.platform === 'win32')       exec(`cmd /c start ${url}`, handleError);
    else if (process.platform === 'darwin') exec(`open ${url}`, handleError);
    else                                    exec(`xdg-open ${url}`, handleError);
  }
});

module.exports = server;

'use strict';
const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const { git } = require('../lib/git');
const { handleGitError } = require('../lib/git-errors');

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
    handleGitError(res, e);
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
    handleGitError(res, e);
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
    handleGitError(res, e);
  }
});

router.post('/delete-path', async (req, res) => {
  const { repoPath, path: filePath } = req.body;
  if (!filePath || typeof filePath !== 'string') {
    return res.status(400).json({ error: 'Ruta inválida' });
  }
  try {
    const fullPath    = path.resolve(repoPath, filePath);
    const repoResolved = path.resolve(repoPath);
    if (!fullPath.startsWith(repoResolved + path.sep) && fullPath !== repoResolved) {
      return res.status(400).json({ error: 'Ruta fuera del repositorio' });
    }
    await git(repoPath).raw(['rm', '-r', '--cached', '--force', '--ignore-unmatch', filePath]);
    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
    res.json({ success: true });
  } catch (e) {
    handleGitError(res, e);
  }
});

router.post('/untrack', async (req, res) => {
  const { repoPath, files } = req.body;
  try {
    await git(repoPath).raw(['rm', '--cached', '--', ...files]);
    res.json({ success: true });
  } catch (e) {
    handleGitError(res, e);
  }
});

router.get('/gitignore', (req, res) => {
  const { repoPath } = req.query;
  const filePath = path.join(path.normalize(repoPath), '.gitignore');
  try {
    const content = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
    res.json({ content });
  } catch (e) {
    handleGitError(res, e);
  }
});

router.post('/gitignore', (req, res) => {
  const { repoPath, content } = req.body;
  const filePath = path.join(path.normalize(repoPath), '.gitignore');
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    res.json({ success: true });
  } catch (e) {
    handleGitError(res, e);
  }
});

module.exports = router;

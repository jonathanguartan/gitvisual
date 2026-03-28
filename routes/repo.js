'use strict';
/**
 * routes/repo.js — Agregador de sub-rutas del repositorio.
 *
 * Cada grupo de rutas vive en su propio archivo para facilitar mantenimiento:
 *   repo-core.js    → check, init, clone, info, status, files/all, log, reflog, blame
 *   repo-staging.js → stage, unstage, discard, delete-path, untrack, gitignore
 *   repo-commits.js → diff, hunks, commit, revert, reset, conflict
 *   repo-remote.js  → push, pull, fetch, push-production, remote CRUD, config/set, open-file
 */
const router = require('express').Router();
const { validateRepoPath } = require('../lib/validation');

// repo-core.js maneja su propia validación selectiva (omite /check, /init, /clone)
router.use(require('./repo-core'));

// Estas sub-rutas siempre requieren un repositorio válido
router.use(validateRepoPath);
router.use(require('./repo-staging'));
router.use(require('./repo-commits'));
router.use(require('./repo-remote'));

module.exports = router;

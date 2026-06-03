// ─── SVG Sprite helper ────────────────────────────────────────────────────────
// Referencia un <symbol id="ic-NAME"> definido en el sprite de index.html.
// Los atributos visuales (stroke, fill, etc.) se aplican via CSS .gvm-ic.
//
// Clases opcionales:
//   'ic-filled'  → fill: currentColor, stroke: none  (ej. dot relleno)
//   'sw-bold'    → stroke-width: 2.5                 (ej. flechas de tracking)

export const use = (name, n = 16, cls = '') =>
  `<svg class="gvm-ic${cls ? ' ' + cls : ''}" width="${n}" height="${n}" aria-hidden="true"><use href="#ic-${name}"/></svg>`;

// ─── Named shortcuts (para usar en templates JS) ──────────────────────────────
export const ic = {
  // Ramas
  branch:         (n = 16) => use('branch',         n),
  dotFilled:      (n = 10) => use('dot-filled',     n, 'ic-filled'),
  dotEmpty:       (n = 10) => use('dot-empty',       n),
  // Remote
  cloud:          (n = 14) => use('cloud',           n),
  ban:            (n = 12) => use('ban',             n),
  // Ahead / Behind
  arrowUp:        (n = 12) => use('arrow-up',        n, 'sw-bold'),
  arrowDown:      (n = 12) => use('arrow-down',      n, 'sw-bold'),
  // Panel controls
  chevronDown:    (n = 14) => use('chevron-down',    n, 'sw-bold'),
  chevronsDown:   (n = 14) => use('chevrons-down',   n),
  chevronsUp:     (n = 14) => use('chevrons-up',     n),
  maximize:       (n = 14) => use('maximize',        n),
  minimize:       (n = 14) => use('minimize',        n),
  x:              (n = 14) => use('x',               n, 'sw-bold'),
  // File actions
  trash:          (n = 14) => use('trash',           n),
  rotateCcw:      (n = 14) => use('rotate-ccw',      n),
  // View mode
  listView:       (n = 14) => use('list-view',       n),
  treeView:       (n = 14) => use('tree-view',       n),
  // Toolbar
  commit:         (n = 18) => use('commit',          n),
  download:       (n = 18) => use('download',        n),
  upload:         (n = 18) => use('upload',          n),
  refreshCw:      (n = 18) => use('refresh-cw',      n),
  refreshCcw:     (n = 18) => use('refresh-ccw',     n),
  gitBranch:      (n = 18) => use('branch',          n),
  archive:        (n = 18) => use('archive',         n),
  tag:            (n = 18) => use('tag',             n),
  undo:           (n = 18) => use('undo',            n),
  clock:          (n = 18) => use('clock',           n),
  archiveRestore: (n = 18) => use('archive-restore', n),
  zap:            (n = 18) => use('zap',             n),
  gitPR:          (n = 18) => use('git-pr',          n),
  fileMinus:      (n = 18) => use('file-minus',      n),
  settings:       (n = 18) => use('settings',        n),
  // Side nav / misc
  listChecks:     (n = 14) => use('list-checks',     n),
  folder:         (n = 14) => use('folder',          n),
};

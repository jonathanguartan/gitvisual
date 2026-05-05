# Git Visual Manager

A visual Git repository manager that runs in the browser (or as a standalone Electron app). Manage multiple repos from a single tabbed interface without leaving your desk.

## Features

- **Multi-repo tabs** — open several repositories simultaneously, each with its own state
- **Stage / unstage / discard** — checkbox selects files; double-click moves them between staged/unstaged; multi-select (Ctrl+click, Shift+click) and drag & drop also supported
- **Commit** with inline diff and syntax-highlighted code review
- **Branch management** — create, rename, delete local/remote, rebase, checkout, ahead/behind tracking badges, pull non-checked-out branches (fast-forward)
- **Branch tree view** — collapsible folders, filter/search input, expand/collapse all
- **Unpublished branch indicator** — local branches without a remote counterpart show a yellow left border and a no-remote badge; branches whose remote was deleted show a "gone" tooltip
- **Branch selection state** — clicking a branch highlights it with `.selected`; persists through re-renders and clears on repo switch
- **Merged branch detection** — pushing a branch already merged into main/master shows a confirmation; branches never pushed are excluded
- **Smart fetch** — updates both branch ahead/behind badges and the status bar
- **Commit log** — graph-style log with file-change detail and context menu (revert, reset soft/mixed/hard, create branch/tag, copy hash)
- **Conflict resolution** — conflicted files highlighted with type indicator (UU/AA/DD…), inline "ours / theirs" buttons, 3-way conflict editor, automatic staging after resolution
- **Diff view** — unified and split modes with old/new line numbers, word-level diff, and per-hunk stage/unstage buttons
- **Stash** — list, push, pop, apply, drop; smart conflict handling on apply: classifies blocked files as identical-to-stash or truly different, offering "Discard and apply" (no extra stash created) when safe, or "Auto-stash and apply" when real differences exist
- **Remote management** — add, rename, set-url, delete remotes from Settings → Remotos
- **Pull Requests** — create and list PRs/MRs for **GitHub**, **Gitea**, **Bitbucket**, and **GitLab**
- **Per-repository configuration** — `rebaseOnPull`, `autoStash`, `diffContext`, `logLimit`, `mainBranch` can be overridden per repo from Settings → Repositorio
- **Custom dialog system** — all confirmations use a styled async `GvmDialog`; no native browser dialogs
- **Context menus** — right-click on branches, files, and commits for quick actions
- **SVG icon sprite** — all icons defined once in the sprite (`index.html`), referenced via `<use href="#ic-name">`
- **Syntax highlighting** — highlight.js served locally, works offline and in Electron
- **Persistent layout** — panel sizes, collapsed sections, and open tabs survive reloads via `localStorage`
- **Electron wrapper** — splash screen, system tray, single-instance lock, custom branding
- **Auto-update** — silently checks GitHub Releases on startup; prompts to download and install; skips in portable builds and dev mode

## Requirements

| Tool | Version |
|------|---------|
| Node.js | ≥ 18 (uses native `fetch`) |
| Git | any recent version |
| Electron (optional) | bundled as devDependency |

## Quick start

```bash
# Install dependencies
npm install

# Run in browser mode (opens http://localhost:3333)
npm start

# Run with live-reload during development
npm run dev

# Run as Electron desktop app
npm run electron

# Electron with live-reload
npm run electron:dev

# Build + publish a release to GitHub (requires GH_TOKEN env var)
npm run dist:publish
```

## Configuration

Settings are stored in **`app-config.json`** (auto-created, git-ignored). You can also edit them from the Settings modal inside the app.

### Global settings

| Key | Description |
|-----|-------------|
| `githubToken` | GitHub personal access token (repo scope) |
| `bitbucketUser` | Bitbucket username |
| `bitbucketPassword` | Bitbucket App Password |
| `gitlabToken` | GitLab personal access token |
| `giteaUrl` | Gitea instance URL (e.g. `http://localhost:3000`) |
| `rebaseOnPull` | Use `--rebase` on pull (default: false) |
| `autoStash` | Use `--autostash` on pull (default: false) |
| `diffContext` | Context lines in diff (default: 3) |
| `logLimit` | Max commits in log (default: 100) |
| `mainBranch` | Default production branch (default: `main`) |
| `openTabs` | Persisted open repository tabs |
| `recentRepos` | Recently opened paths |

### Per-repository overrides

The keys `rebaseOnPull`, `autoStash`, `diffContext`, `logLimit`, and `mainBranch` can be overridden per repository from **Settings → Repositorio**. Overrides are stored under the `repos` key in `app-config.json` keyed by absolute repo path.

## Project structure

```
git-visual-manager/
├── server.js               # Express entry — mounts routers, serves static files
├── lib/
│   ├── config.js           # loadConfig / saveConfig / loadRepoConfig / saveRepoConfig helpers
│   ├── git.js              # git(repoPath) helper (simple-git wrapper)
│   ├── git-errors.js       # handleGitError — normalizes git errors to user messages
│   ├── validation.js       # input parameter validation (backend)
│   ├── logger.js           # logging
│   └── platforms/          # PR clients (github.js, gitlab.js, bitbucket.js, gitea.js)
├── routes/
│   ├── config.js           # /api/config — app settings + session tabs + per-repo overrides
│   ├── repo-core.js        # /api/repo — check, init, info, status, diff, stage, commit, reset
│   ├── repo-commits.js     # /api/repo — log, show commit, cherry-pick, revert, blame
│   ├── repo-remote.js      # /api/repo — push, pull, fetch, clone, remote CRUD
│   ├── repo-staging.js     # /api/repo — stage-hunk, discard, conflict resolution
│   ├── branches.js         # /api/repo/branch/* + merge + rebase + cherry-pick + tracking (isGone)
│   ├── tags.js             # /api/repo/tag/*
│   ├── stash.js            # /api/repo/stash/*
│   ├── recover.js          # /api/repo/recover/* — fsck + reflog recovery
│   ├── pr.js               # /api/pr/* — GitHub/Bitbucket/GitLab/Gitea PRs
│   └── fs.js               # /api/fs/* — filesystem browser
├── public/
│   ├── index.html          # Single-page app shell + SVG icon sprite (all <symbol> definitions)
│   ├── images/
│   │   └── logos/          # App logos: dark.png, light.png (header, welcome, splash)
│   ├── js/                 # Frontend ES Modules (no bundler)
│   │   ├── init.js         # Bootstrap, global event bindings, keyboard shortcuts
│   │   ├── state.js        # Multi-tab state via Proxy
│   │   ├── bus.js          # Event bus (emit/on)
│   │   ├── api.js          # fetch wrapper with repoPath and per-tab AbortController
│   │   ├── icons.js        # SVG sprite helpers — use(name) + ic.{name}() shortcuts
│   │   ├── validation.js   # Frontend mirror of lib/validation.js (isValidRefName, etc.)
│   │   ├── diff.js         # Diff render, hunk staging, clearLastDiff()
│   │   ├── files*.js       # Changes panel (render, select, ops, history, gitignore)
│   │   ├── branches*.js    # Branches panel (render, ctx-menu, ops, setSelectedBranch)
│   │   ├── gvm/            # Reusable UI components
│   │   │   ├── gvm-list.js         # GvmList — virtual-scroll list
│   │   │   ├── gvm-editor.js       # GvmEditor — inline text editor
│   │   │   ├── gvm-pane.js         # GvmPane — resizable split pane
│   │   │   ├── gvm-ctx-menu.js     # GvmContextMenu — right-click menus
│   │   │   └── gvm-dialog.js       # GvmDialog — async confirm/alert replacing native dialogs
│   │   └── ...             # log, commit, sync, repo, tabs, stash, tags, pr, settings, reflog
│   └── styles/             # Modular CSS (@import from style.css)
│       ├── base.css        # Variables, reset, buttons
│       ├── layout.css      # Header, sidebar, main panel, tab-nav, branch-item states
│       ├── changes.css     # Changes tab, file items, diff view
│       ├── log.css         # Log/graph, PRs tab, badges
│       ├── modals.css      # Modals, toasts, forms, overlays + GvmDialog styles
│       ├── toolbar.css     # Toolbar, side-nav, resizers
│       └── components.css  # Context menus, recovery, file-select, syntax, .gvm-ic icon styles
├── electron/
│   ├── main.js             # Electron main process — splash, tray, BrowserWindow, single-instance lock
│   ├── updater.js          # Auto-update via electron-updater (GitHub Releases)
│   ├── splash.html         # Frameless splash screen with app logo
│   └── icons/              # Custom icons (icon16/32/256.png, icon.ico, icon.icns)
├── tests/
│   └── lib/                # Unit tests (no external dependencies)
│       ├── validation.test.js
│       ├── git-errors.test.js
│       └── config.test.js
├── app-config.json         # Runtime config (auto-created, never commit)
└── package.json
```

## Custom Electron icons

Place your own images in `electron/icons/`. If absent, a solid-colour PNG is generated automatically.

| File | Used for |
|------|----------|
| `icon16.png` | System tray |
| `icon32.png` | Title bar / taskbar |
| `icon256.png` | Main window / installer |
| `icon.ico` | Windows (electron-builder) |
| `icon.icns` | macOS (electron-builder) |

Design at 256 × 256 and export to smaller sizes. Tools: [favicon.io](https://favicon.io) (PNG → ICO), [cloudconvert.com](https://cloudconvert.com) (PNG → ICNS).

## API endpoints (backend)

All endpoints are prefixed `/api`.

### Repository
| Method | Path | Body / Params | Description |
|--------|------|---------------|-------------|
| GET | `/repo/info` | `?path=` | Repo status, current branch, platform detection |
| POST | `/repo/open` | `{ repoPath }` | Open/validate a repository |
| POST | `/repo/stage` | `{ repoPath, files[] }` | Stage files |
| POST | `/repo/unstage` | `{ repoPath, files[] }` | Unstage files |
| POST | `/repo/discard` | `{ repoPath, files[] }` | Discard working-tree changes |
| POST | `/repo/commit` | `{ repoPath, message, amend? }` | Create or amend commit |
| POST | `/repo/push` | `{ repoPath, remote?, branch? }` | Push |
| POST | `/repo/pull` | `{ repoPath }` | Pull current branch |
| POST | `/repo/fetch` | `{ repoPath }` | Fetch all |
| GET | `/repo/diff` | `?path=&file=&staged=` | File diff |
| GET | `/repo/log` | `?path=&branch?=&n?=` | Commit log |
| POST | `/repo/open-file` | `{ repoPath, file }` | Open file in system default app |

### Branches
| Method | Path | Body | Description |
|--------|------|------|-------------|
| GET | `/repo/branches` | `?path=` | List local + remote branches |
| GET | `/repo/branches/tracking` | `?path=` | Ahead/behind + `isGone` flag for all local branches |
| POST | `/repo/branch/checkout` | `{ repoPath, branch }` | Checkout |
| POST | `/repo/branch/create` | `{ repoPath, name, from? }` | Create + checkout |
| POST | `/repo/branch/create-at` | `{ repoPath, name, hash }` | Create at commit (no checkout) |
| POST | `/repo/branch/rename` | `{ repoPath, oldName, newName }` | Rename local branch |
| POST | `/repo/branch/delete` | `{ repoPath, branch }` | Delete local branch |
| POST | `/repo/branch/delete-remote` | `{ repoPath, remote, branch }` | Delete remote branch |
| POST | `/repo/branch/rebase` | `{ repoPath, branch, onto }` | Rebase branch onto |
| POST | `/repo/branch/pull-ff` | `{ repoPath, branch, remote? }` | Fast-forward update without checkout |
| POST | `/repo/branch/merge` | `{ repoPath, branch }` | Merge into current |

### Configuration
| Method | Path | Body | Description |
|--------|------|------|-------------|
| GET | `/config` | — | Get global config |
| POST | `/config/save` | `{ ...keys }` | Save global config |
| GET | `/config/repo` | `?repoPath=` | Get `{ global, overrides }` for a repo |
| POST | `/config/repo/save` | `{ repoPath, ...keys }` | Save per-repo overrides |
| POST | `/config/repo/clear` | `{ repoPath }` | Delete all per-repo overrides |

### Tags
| Method | Path | Body | Description |
|--------|------|------|-------------|
| GET | `/repo/tags` | `?path=` | List tags with type (`annotated`/`lightweight`) |
| POST | `/repo/tag/create` | `{ repoPath, name, message?, hash? }` | Create annotated/lightweight tag |
| POST | `/repo/tag/delete` | `{ repoPath, name }` | Delete local tag |
| POST | `/repo/tag/push` | `{ repoPath, name }` | Push tag to remote |
| POST | `/repo/tag/delete-remote` | `{ repoPath, name }` | Delete tag from remote |

### Pull Requests
| Method | Path | Body | Description |
|--------|------|------|-------------|
| GET | `/pr/list` | `?path=` | List open PRs/MRs |
| POST | `/pr/create` | `{ repoPath, title, body, head, base, type? }` | Create PR/MR |

### Commits
| Method | Path | Body | Description |
|--------|------|------|-------------|
| GET | `/repo/commit/:hash/files` | `?path=` | Files changed in a commit |
| GET | `/repo/commit/:hash/diff` | `?path=&file=` | Diff for a file in a commit |
| POST | `/repo/commit/revert` | `{ repoPath, hash }` | Revert a commit |
| POST | `/repo/reset` | `{ repoPath, hash, mode }` | Reset HEAD (`soft`/`mixed`/`hard`) |

### Conflictos
| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/repo/checkout-conflict` | `{ repoPath, file, side }` | Resolver conflicto aceptando `ours` o `theirs` |

### Remotos
| Method | Path | Body | Description |
|--------|------|------|-------------|
| POST | `/repo/remote/add` | `{ repoPath, name, url }` | Agregar remote |
| POST | `/repo/remote/delete` | `{ repoPath, name }` | Eliminar remote |
| POST | `/repo/remote/rename` | `{ repoPath, oldName, newName }` | Renombrar remote |
| POST | `/repo/remote/set-url` | `{ repoPath, name, url }` | Cambiar URL de remote |

## Contributing

1. Fork the repo and create a feature branch.
2. Run `npm run dev` for live-reload.
3. Backend logic goes in `routes/*.js`; frontend in `public/js/` — no build step required.
4. Test in both browser and Electron modes before submitting a PR.

# Git Visual Manager

A visual Git repository manager that runs in the browser (or as a standalone Electron app). Manage multiple repos from a single tabbed interface without leaving your desk.

## Features

- **Multi-repo tabs** — open several repositories simultaneously, each with its own state
- **Stage / unstage / discard** — with multi-select (Ctrl+click, Shift+click) and drag & drop between panels
- **Commit** with inline diff and syntax-highlighted code review
- **Branch management** — create, rename, delete local/remote, rebase, checkout, ahead/behind tracking badges, pull non-checked-out branches (fast-forward)
- **Branch tree view** — collapsible folders, filter/search input, expand/collapse all
- **Commit log** — graph-style log with file-change detail and context menu (revert, reset soft/mixed/hard, create branch/tag at hash, copy hash)
- **Conflict resolution** — conflicted files are visually highlighted with type indicator (UU/AA/DD…), inline "ours / theirs" buttons, and automatic staging after resolution
- **Diff with line numbers** — unified and split diff views now show old/new line numbers
- **Remote management** — add, rename, set-url, delete remotes from the Settings → Remotos tab
- **Pull Requests** — create and list PRs/MRs for **GitHub**, **Gitea**, **Bitbucket**, and **GitLab**
- **Context menus** — right-click on branches, files, and commits for quick actions; icons auto-split for consistent layout
- **Syntax highlighting** — powered by highlight.js (served locally, works offline / in Electron)
- **Persistent layout** — panel sizes, collapsed sections, and open tabs survive page reloads via `localStorage`
- **Electron wrapper** — splash screen, system tray, auto-generated icon (no external build deps)

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
```

## Configuration

Settings are stored in **`app-config.json`** (auto-created, git-ignored). You can also edit them from the Settings modal inside the app.

| Key | Description |
|-----|-------------|
| `githubToken` | GitHub personal access token (repo scope) |
| `bitbucketUser` | Bitbucket username |
| `bitbucketPassword` | Bitbucket App Password |
| `gitlabToken` | GitLab personal access token |
| `giteaUrl` | Gitea instance URL (e.g. `http://localhost:3000`) |
| `openTabs` | Persisted open repository tabs |
| `recentRepos` | Recently opened paths |

## Project structure

```
git-visual-manager/
├── server.js               # Express entry — mounts routers, serves static files
├── lib/
│   ├── config.js           # loadConfig / saveConfig helpers
│   ├── git.js              # git(repoPath) helper (simple-git wrapper)
│   ├── git-errors.js       # handleGitError — normalizes git errors to user messages
│   ├── validation.js       # input parameter validation
│   ├── logger.js           # logging
│   └── platforms/          # PR clients (github.js, gitlab.js, bitbucket.js, gitea.js)
├── routes/
│   ├── config.js           # /api/config — app settings + session tabs
│   ├── repo-core.js        # /api/repo — check, init, info, status, diff, stage, commit, reset
│   ├── repo-commits.js     # /api/repo — log, show commit, cherry-pick, revert, blame
│   ├── repo-remote.js      # /api/repo — push, pull, fetch, clone, remote CRUD
│   ├── repo-staging.js     # /api/repo — stage-hunk, discard, conflict resolution
│   ├── branches.js         # /api/repo/branch/* + merge + rebase + cherry-pick + tracking
│   ├── tags.js             # /api/repo/tag/*
│   ├── stash.js            # /api/repo/stash/*
│   ├── recover.js          # /api/repo/recover/* — fsck + reflog recovery
│   ├── pr.js               # /api/pr/* — GitHub/Bitbucket/GitLab/Gitea PRs
│   └── fs.js               # /api/fs/* — filesystem browser
├── public/
│   ├── index.html          # Single-page app shell
│   ├── js/                 # Frontend ES Modules (no bundler)
│   │   ├── init.js         # Bootstrap, global event bindings, keyboard shortcuts
│   │   ├── state.js        # Multi-tab state via Proxy
│   │   ├── bus.js          # Event bus (emit/on)
│   │   ├── api.js          # fetch wrapper with repoPath and per-tab AbortController
│   │   ├── diff.js         # Diff render, hunk staging, clearLastDiff()
│   │   ├── files*.js       # Changes panel (render, select, ops, history, gitignore)
│   │   ├── branches*.js    # Branches panel (render, ctx-menu, ops)
│   │   ├── gvm/            # Reusable UI components (GvmList, GvmEditor, GvmPane, GvmContextMenu)
│   │   └── ...             # log, commit, sync, repo, tabs, stash, tags, pr, settings, reflog
│   └── styles/             # Modular CSS (@import from style.css)
│       ├── base.css        # Variables, reset, buttons
│       ├── layout.css      # Header, sidebar, main panel, tab-nav
│       ├── changes.css     # Changes tab, file items, diff view
│       ├── log.css         # Log/graph, PRs tab, badges
│       ├── modals.css      # Modals, toasts, forms, overlays
│       ├── toolbar.css     # Toolbar, side-nav, resizers
│       └── components.css  # Context menus, recovery, file-select, syntax
├── electron/
│   ├── main.js             # Electron main process — splash, tray, BrowserWindow
│   ├── splash.html         # Frameless splash screen
│   └── icons/              # Custom icons (icon16/32/256.png)
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
| GET | `/repo/branches/tracking` | `?path=` | Ahead/behind info for all local branches |
| POST | `/repo/branch/checkout` | `{ repoPath, branch }` | Checkout |
| POST | `/repo/branch/create` | `{ repoPath, name, from? }` | Create + checkout |
| POST | `/repo/branch/create-at` | `{ repoPath, name, hash }` | Create at commit (no checkout) |
| POST | `/repo/branch/rename` | `{ repoPath, oldName, newName }` | Rename local branch |
| POST | `/repo/branch/delete` | `{ repoPath, branch }` | Delete local branch |
| POST | `/repo/branch/delete-remote` | `{ repoPath, remote, branch }` | Delete remote branch |
| POST | `/repo/branch/rebase` | `{ repoPath, branch, onto }` | Rebase branch onto |
| POST | `/repo/branch/pull-ff` | `{ repoPath, branch, remote? }` | Fast-forward update without checkout |
| POST | `/repo/branch/merge` | `{ repoPath, branch }` | Merge into current |

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
3. Backend logic goes in `routes/*.js`; frontend in `public/app.js` — no build step required.
4. Test in both browser and Electron modes before submitting a PR.

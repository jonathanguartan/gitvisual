const simpleGit = require('simple-git');
const path      = require('path');

function git(repoPath) {
  const normalized = repoPath ? path.normalize(String(repoPath)) : process.cwd();
  return simpleGit(normalized);
}

module.exports = { git };

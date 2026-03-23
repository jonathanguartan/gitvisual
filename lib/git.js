const simpleGit = require('simple-git');
const path      = require('path');

function git(repoPath) {
  return simpleGit(path.normalize(repoPath));
}

module.exports = { git };

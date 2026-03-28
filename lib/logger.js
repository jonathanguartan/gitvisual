'use strict';

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const CURRENT = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info;

function _fmt(level, msg, meta) {
  const ts   = new Date().toISOString();
  const base = `${ts} [${level.toUpperCase()}] ${msg}`;
  if (!meta || Object.keys(meta).length === 0) return base;
  const metaStr = Object.entries(meta)
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' ');
  return `${base} | ${metaStr}`;
}

function _log(level, msg, meta = {}) {
  if (LEVELS[level] > CURRENT) return;
  const line = _fmt(level, msg, meta);
  if (level === 'error' || level === 'warn') process.stderr.write(line + '\n');
  else                                       process.stdout.write(line + '\n');
}

const logger = {
  error: (msg, meta) => _log('error', msg, meta),
  warn:  (msg, meta) => _log('warn',  msg, meta),
  info:  (msg, meta) => _log('info',  msg, meta),
  debug: (msg, meta) => _log('debug', msg, meta),
};

module.exports = logger;

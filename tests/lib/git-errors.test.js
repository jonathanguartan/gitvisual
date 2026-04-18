'use strict';
const { handleGitError } = require('../../lib/git-errors');

let passed = 0, failed = 0;
function test(desc, fn) {
  try { fn(); console.log(`  ✓ ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${desc}: ${e.message}`); failed++; }
}

function mockRes() {
  let _status = 200, _body = null;
  return {
    status(code) { _status = code; return this; },
    json(data)   { _body = data; return this; },
    get statusCode() { return _status; },
    get body()       { return _body; },
  };
}

console.log('\nhandleGitError — patrones conocidos:');

test('detecta GitHub Push Protection (GH013)', () => {
  const res = mockRes();
  handleGitError(res, new Error('error: GH013: Repository rule violations found for refs/heads/main'));
  if (!res.body.error.includes('GitHub bloqueó')) throw new Error('Mensaje incorrecto: ' + res.body.error.slice(0, 60));
});

test('detecta "would be overwritten"', () => {
  const res = mockRes();
  handleGitError(res, new Error('error: Your local changes would be overwritten by merge'));
  if (!res.body.error.includes('pull')) throw new Error('Mensaje incorrecto');
});

test('detecta Authentication failed', () => {
  const res = mockRes();
  handleGitError(res, new Error('fatal: Authentication failed for https://github.com/foo/bar'));
  if (!res.body.error.toLowerCase().includes('autenticación')) throw new Error('Mensaje incorrecto');
});

test('detecta index.lock', () => {
  const res = mockRes();
  handleGitError(res, new Error("fatal: Unable to create '.git/index.lock': File exists."));
  if (!res.body.error.includes('bloqueo')) throw new Error('Mensaje incorrecto');
});

test('detecta not a git repository', () => {
  const res = mockRes();
  handleGitError(res, new Error('fatal: not a git repository (or any of the parent directories): .git'));
  if (!res.body.error.includes('repositorio')) throw new Error('Mensaje incorrecto');
});

test('retorna mensaje raw para errores desconocidos', () => {
  const res = mockRes();
  const e   = new Error('totally unknown git error xyz-abc');
  handleGitError(res, e);
  if (res.body.error !== e.message) throw new Error('Debería retornar el mensaje original');
});

test('agrega [Debug] cuando se pasa opts.debug', () => {
  const res = mockRes();
  handleGitError(res, new Error('some error'), { debug: 'extra-context' });
  if (!res.body.error.includes('[Debug] extra-context')) throw new Error('Debug no incluido');
});

test('siempre responde con status 500', () => {
  const res = mockRes();
  handleGitError(res, new Error('test'));
  if (res.statusCode !== 500) throw new Error(`Esperado 500, got ${res.statusCode}`);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

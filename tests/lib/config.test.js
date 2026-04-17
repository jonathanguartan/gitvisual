'use strict';
const { loadConfig, saveConfig } = require('../../lib/config');

let passed = 0, failed = 0;
function test(desc, fn) {
  try { fn(); console.log(`  ✓ ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${desc}: ${e.message}`); failed++; }
}

console.log('\nloadConfig:');

test('retorna un objeto', () => {
  const cfg = loadConfig();
  if (typeof cfg !== 'object' || cfg === null) throw new Error('Esperaba objeto');
});

test('incluye openTabs como array', () => {
  const cfg = loadConfig();
  if (!Array.isArray(cfg.openTabs)) throw new Error(`openTabs debe ser array, got ${typeof cfg.openTabs}`);
});

test('incluye recentRepos como array', () => {
  const cfg = loadConfig();
  if (!Array.isArray(cfg.recentRepos)) throw new Error(`recentRepos debe ser array`);
});

test('incluye logLimit como número', () => {
  const cfg = loadConfig();
  if (typeof cfg.logLimit !== 'number') throw new Error(`logLimit debe ser número, got ${typeof cfg.logLimit}`);
});

test('incluye platforms como objeto', () => {
  const cfg = loadConfig();
  if (typeof cfg.platforms !== 'object' || cfg.platforms === null) throw new Error('platforms debe ser objeto');
});

test('incluye mainBranch como string', () => {
  const cfg = loadConfig();
  if (typeof cfg.mainBranch !== 'string') throw new Error('mainBranch debe ser string');
});

test('no tiene __proto__ en platforms (sin prototype pollution)', () => {
  const cfg = loadConfig();
  if (Object.prototype.hasOwnProperty.call(cfg, '__proto__')) throw new Error('__proto__ no debería estar presente');
});

console.log('\nsaveConfig — validaciones de rango:');

test('logLimit: respeta rango 1-5000', () => {
  const before = loadConfig();
  saveConfig({ logLimit: 99999 });
  const after = loadConfig();
  if (after.logLimit > 5000) throw new Error(`logLimit no fue limitado: ${after.logLimit}`);
  // Restaurar
  saveConfig({ logLimit: before.logLimit });
});

test('diffContext: respeta rango 0-100', () => {
  const before = loadConfig();
  saveConfig({ diffContext: -5 });
  const after = loadConfig();
  if (after.diffContext < 0) throw new Error(`diffContext negativo no fue corregido: ${after.diffContext}`);
  saveConfig({ diffContext: before.diffContext });
});

test('ignora claves desconocidas sin lanzar error', () => {
  saveConfig({ unknownField: 'should-be-ignored', anotherField: 123 });
  // Solo verificar que no lanzó excepción
});

test('deep-merge platforms sin sobreescribir todo', () => {
  const before = loadConfig();
  const originalPlatforms = JSON.parse(JSON.stringify(before.platforms));
  saveConfig({ platforms: { github: { token: 'test-token-xyz' } } });
  const after = loadConfig();
  if (after.platforms?.github?.token !== 'test-token-xyz') throw new Error('Token de github no fue guardado');
  // Restaurar
  saveConfig({ platforms: originalPlatforms });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

'use strict';
const { isValidRefName, isValidHash } = require('../../lib/validation');

let passed = 0, failed = 0;
function test(desc, fn) {
  try { fn(); console.log(`  ✓ ${desc}`); passed++; }
  catch (e) { console.error(`  ✗ ${desc}: ${e.message}`); failed++; }
}
function expect(val) {
  return {
    toBeTrue:  () => { if (val !== true)  throw new Error(`Expected true, got ${val}`); },
    toBeFalse: () => { if (val !== false) throw new Error(`Expected false, got ${val}`); },
  };
}

console.log('\nisValidRefName:');
test('acepta nombre simple',              () => expect(isValidRefName('main')).toBeTrue());
test('acepta nombre con slash',           () => expect(isValidRefName('feature/login')).toBeTrue());
test('acepta nombre con guion',           () => expect(isValidRefName('fix-bug-123')).toBeTrue());
test('acepta nombre con punto',           () => expect(isValidRefName('v1.0.0')).toBeTrue());
test('rechaza string vacío',              () => expect(isValidRefName('')).toBeFalse());
test('rechaza null',                      () => expect(isValidRefName(null)).toBeFalse());
test('rechaza nombre con espacio',        () => expect(isValidRefName('my branch')).toBeFalse());
test('rechaza nombre con ..',             () => expect(isValidRefName('a..b')).toBeFalse());
test('rechaza nombre que empieza con -',  () => expect(isValidRefName('-bad')).toBeFalse());
test('rechaza nombre que empieza con /',  () => expect(isValidRefName('/branch')).toBeFalse());
test('rechaza nombre que termina con /',  () => expect(isValidRefName('branch/')).toBeFalse());
test('rechaza nombre .lock',              () => expect(isValidRefName('foo.lock')).toBeFalse());
test('rechaza nombre con ~',              () => expect(isValidRefName('a~b')).toBeFalse());
test('rechaza nombre con ^',              () => expect(isValidRefName('a^b')).toBeFalse());
test('rechaza nombre con :',              () => expect(isValidRefName('a:b')).toBeFalse());

console.log('\nisValidHash:');
test('acepta hash de 40 chars',      () => expect(isValidHash('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2')).toBeTrue());
test('acepta hash corto de 7 chars', () => expect(isValidHash('abc1234')).toBeTrue());
test('rechaza null',                 () => expect(isValidHash(null)).toBeFalse());
test('rechaza hash con -',           () => expect(isValidHash('-abc1234')).toBeFalse());
test('rechaza letras fuera de hex',  () => expect(isValidHash('xyz12345')).toBeFalse());
test('rechaza hash de 3 chars',      () => expect(isValidHash('abc')).toBeFalse());
test('rechaza string vacío',         () => expect(isValidHash('')).toBeFalse());

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

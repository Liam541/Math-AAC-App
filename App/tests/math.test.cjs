const { test } = require('node:test');
const assert = require('node:assert/strict');
const math = require('../math.js');
const near = (value, expected, tolerance = 1e-9) => assert.ok(Math.abs(value - expected) < tolerance, `${value} ≠ ${expected}`);

test('precedence, exponent associativity, implicit multiplication, and notation', () => {
  for (const [source, expected] of [['2+3*4', 14], ['2^3^2', 512], ['-2^2', -4], ['(-2)^2', 4], ['2^-2', 0.25], ['2(3+4)', 14], ['2π', 2 * Math.PI], ['3E-4', 0.0003], ['50%', 0.5], ['200*10%', 20], ['5!', 120], ['0!', 1], ['mod(10,3)', 1], ['ncr(5,2)', 10], ['npr(5,2)', 20], ['2**3', 8], ['6÷2×3', 9], ['sqrt(4)+abs(-3)', 5]]) near(math.evaluate(source), expected);
});
test('scientific functions, constants, and saved answer', () => {
  near(math.evaluate('ln(e)'), 1); near(math.evaluate('log(100)'), 2);
  near(math.evaluate('sin(pi/2)'), 1); near(math.evaluate('sin(90)', { angle: 'deg' }), 1);
  near(math.evaluate('asin(1)', { angle: 'deg' }), 90); near(math.evaluate('atan(1)'), Math.PI / 4);
  near(math.evaluate('Ans/2', { ans: 7 }), 3.5); near(math.compile('3x^2')(2), 12);
  near(math.compile('t^2', { variable: 't' })(3), 9);
  assert.notEqual(math.format(1e-15), '0');
});
test('rejects malformed expressions, invalid domains, nonfinite results and arbitrary JS', () => {
  for (const source of ['', '2+', '(2', '2 3', '1/0', 'sqrt(-1)', 'ln(0)', '(-2)!', '2.5!', '171!', 'sin()', 'sin(1,2)', 'ncr(3,4)', 'Math.PI', 'globalThis', 'alert(1)', 'constructor(1)', 'x', '1e999', '-'.repeat(200) + '1']) assert.throws(() => math.evaluate(source), undefined, source);
  assert.throws(() => math.evaluate('tan(90)', { angle: 'deg' }));
});

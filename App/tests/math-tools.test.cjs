const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const api = require('../functions.js');
const math = api;
const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≈ ${b}`);

test('Greek parameters evaluate, compose and survive saved-function restoration', () => {
  const c = new api.Calculator();
  c.define('f(θ)=sin(θ)');
  c.define('g(α,β)=α^2+β');
  near(c.evaluate('f(pi/2)').value, 1);
  assert.equal(c.evaluate('g(2,3)').value, 7);
  const restored = new api.Calculator(); restored.restore(c.serialize());
  near(restored.evaluate('f(pi/2)').value, 1);
});

test('compiled graph expressions support implicit multiplication and do not change Ans', () => {
  const c = new api.Calculator(); c.define('f(t)=t^2+1'); c.evaluate('17');
  const graph = c.compile('f(x)+x(x+1)', ['x']);
  assert.equal(graph({ x: 2 }), 11); assert.equal(graph({ x: -2 }), 7);
  assert.equal(c.answer, 17);
  assert.throws(() => c.compile('1/x', ['x'])({ x: 0 }));
});

test('symbolic antiderivatives differentiate back to original functions', () => {
  const c = new api.Calculator(); c.define('f(t)=3t^2+2t+1'); c.define('g(x)=f(2x)');
  for (const expression of ['x^2', '3x^2+2x+1', 'sin(2x+1)', 'cos(x)', 'exp(3x)', 'e^x', '1/x', '2/(3x+1)', 'sqrt(x)', 'x^-2', 'f(x)', 'g(x)', 'pi', 'x/2', 'x*x', 'x(x+1)', '(x^2+1)^2']) {
    const result = math.indefinite(c, expression, 'x');
    assert.match(result, / \+ C$/);
    const F = c.compile(result.replace(/ \+ C$/, ''), ['x']), f = c.compile(expression, ['x']);
    for (const x of [.5, 1, 2]) near((F({ x: x + 1e-5 }) - F({ x: x - 1e-5 })) / 2e-5, f({ x }), 1e-5);
  }
  assert.match(math.indefinite(c, 'sin(θ)', 'θ'), /cos\(theta\)/);
  for (const expression of ['sin(x^2)', 'x/0', 'z+x', 'missing(x)', 'sin(x,2)']) assert.throws(() => math.indefinite(c, expression, 'x'));
});

test('integrals evaluate inside calculator expressions and saved functions', () => {
  const c = new api.Calculator();
  near(c.evaluate('integral(x^2,x,0,3)').value, 9);
  near(c.evaluate('2+integrate(sin(x),x,0,pi)').value, 4);
  near(c.evaluate('integral(x(x+1),x,0,1)').value, 5/6);
  near(c.evaluate('integral(-x,x,0,1)').value, -.5);
  c.define('F(t)=integral(x^2,x,0,t)'); near(c.evaluate('F(3)').value, 9);
  const restored = new api.Calculator(); restored.restore(c.serialize());
  near(restored.evaluate('F(2)').value, 8/3);
  for (const source of ['integral(x^2,x)', 'Integral: x^2', '∫ x^2 dx']) {
    const result = c.evaluate(source);
    assert.equal(result.kind, 'symbolic'); assert.match(result.value, /\+ C$/);
  }
  for (const source of ['integral(x)', 'integral(x,2,0,1)', 'integral(x,x,0)', '2+integral(x,x)', 'integral(z,x,0,1)', 'integral(1/x,x,-1,1)']) assert.throws(() => c.evaluate(source));
});

test('live previews do not modify Ans or saved definitions', () => {
  const c = new api.Calculator(); c.evaluate('7'); c.define('f(x)=x^2');
  assert.equal(c.preview('Ans+1').value, 8); assert.equal(c.answer, 7);
  c.preview('f(x)=x+1'); assert.equal(c.evaluate('f(3)').value, 9);
});

test('definite integration handles bounds, saved functions and rejects singularities', () => {
  const c = new api.Calculator(); c.define('f(t)=t^2'); c.evaluate('42');
  near(math.definite(c, 'f(x)', 'x', 0, 1), 1/3);
  near(math.definite(c, 'sin(x)', 'x', 0, Math.PI), 2);
  near(math.definite(c, 'exp(-x^2)', 'x', -1, 1), 1.493648265624854);
  near(math.definite(c, 'x^2', 'x', 1, 0), -1/3);
  assert.equal(math.definite(c, 'x^2', 'x', 2, 2), 0);
  for (const [source, a, b] of [['1/x', -1, 1], ['1/(x-.1)', -1, 1], ['sqrt(x)', -1, 1], ['x', 0, Infinity]]) assert.throws(() => math.definite(c, source, 'x', a, b));
  assert.equal(c.answer, 42);
});

test('finite sums, products, combinations and permutations validate their inputs', () => {
  const c = new api.Calculator();
  assert.equal(math.series(c, 'k^2', 'k', 1, 5), 55);
  assert.equal(math.series(c, 'k', 'k', 1, 5, true), 120);
  assert.equal(math.counting(5, 2), 10); assert.equal(math.counting(5, 2, true), 20);
  assert.equal(math.counting(0, 0), 1);
  for (const args of [[5, 6], [-1, 0], [2.5, 1]]) assert.throws(() => math.counting(...args));
  assert.throws(() => math.series(c, 'k', 'k', 5, 1));
  assert.throws(() => math.series(c, 'k', 'k', 1, 10001));
});

test('oscillating integrals do not alias to a constant or zero', () => {
  const c = new api.Calculator();
  near(math.definite(c, 'cos(128*pi*x)', 'x', 0, 1), 0);
  near(math.definite(c, 'sin(128*pi*x)^2', 'x', 0, 1), .5);
  assert.throws(() => math.definite(c, 'x', 'x', -1e308, 1e308));
});

test('symbolic simplification cannot hide invalid expressions', () => {
  const c = new api.Calculator();
  for (const source of ['0*missing(x)', '0*(1/0)', '0*z', '0*sin(x,2)']) assert.throws(() => math.indefinite(c, source, 'x'));
});

test('large combinations remain exact within safe integer range', () => {
  assert.equal(math.counting(54, 23), 1085929983159840);
  assert.equal(math.counting(54, 24), 1402659561581460);
  assert.equal(math.counting(54, 25), 1683191473897752);
});

function screen() {
  let focused;
  class Element {
    constructor(id = '') { this.id = id; this.value = ''; this.textContent = ''; this.children = []; this.dataset = {}; this.hidden = false; this.handlers = {}; this.attrs = {}; this.classList = { toggle() {} }; }
    append(...nodes) { this.children.push(...nodes); }
    add(node) { this.append(node); }
    replaceChildren(...nodes) { this.children = nodes; }
    setAttribute(key, value) { this.attrs[key] = value; }
    addEventListener(key, callback) { const previous = this.handlers[key]; this.handlers[key] = event => { previous?.(event); callback(event); }; }
    click() { this.onclick?.(); this.handlers.click?.(); }
    focus() { focused = this; this.handlers.focus?.(); }
    select() { this.selectionStart = 0; this.selectionEnd = this.value.length; }
    setRangeText(text, start, end) { this.value = this.value.slice(0, start) + text + this.value.slice(end); this.selectionStart = this.selectionEnd = start + text.length; }
    closest() { return null; }
    querySelector() { return null; }
    querySelectorAll() { return this.id === 'calculus' ? ['lower', 'upper', 'expression', 'variable'].map(part => elements['integral-' + part]) : []; }
    get selectedOptions() { return [{ textContent: this.value }]; }
  }
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const elements = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(m => [m[1], new Element(m[1])]));
  for (const m of html.matchAll(/<input\b[^>]*\bid="([^"]+)"[^>]*value="([^"]*)"/g)) elements[m[1]].value = m[2];
  const tab = new Element();
  const c = new api.Calculator(); c.define('f(t)=t^2+1'); c.define('h(x,y)=x+y');
  let selectedTab, selectedSubtab;
  const context = vm.createContext({ setTimeout: () => 1, clearTimeout() {}, AACFunctions: api, AACMathTools: math, mathCalculator: c,
    document: { getElementById: id => elements[id], querySelector: selector => selector.includes('data-subtab') ? tab : null,
      querySelectorAll: () => [], createElement: () => new Element(), createElementNS: () => new Element() },
    Option: function (label, value) { this.textContent = label; this.value = value; },
    setStatus() {}, selectTab: name => { selectedTab = name; }, selectSubtab: button => { selectedSubtab = button; } });
  context.window = context;
  context.module = { exports: {} };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../functions.js'), 'utf8'), context);
  context.module.exports.initializeMathTools();
  return { elements, context, c, selected: () => [selectedTab, selectedSubtab === tab], focused: () => focused?.id };
}

test('integral mode switches bounds and calculates through the form', () => {
  const { elements: e } = screen();
  e['integral-indefinite'].click();
  e['integral-calculate'].click(); assert.match(e['integral-result'].textContent, /\+ C/);
  e['integral-definite'].click(); assert.equal(e['integral-bounds'].hidden, false);
  e['integral-calculate'].click(); assert.match(e['integral-result'].textContent, /0\.333333333333/);
  e['integral-lower'].value = 'bad'; e['integral-calculate'].click(); assert.match(e['integral-result'].textContent, /Could not calculate/);
  e['integral-indefinite'].click(); assert.equal(e['integral-bounds'].hidden, true);
});

test('integral slots support field buttons, bound arrow navigation and targeted touch input', () => {
  const { elements: e, focused } = screen();
  e['integral-calculate'].click(); assert.match(e['integral-result'].textContent, /0\.333333333333/);
  e['integral-edit-upper'].click();
  assert.equal(focused(), 'integral-upper');
  assert.equal(e['integral-edit-upper'].attrs['aria-pressed'], 'true');
  const keypad = e['integral-keypad-host'].children.at(-1);
  keypad.children.find(key => key.textContent === '7').click();
  assert.equal(e['integral-upper'].value, '7');
  assert.equal(e['integral-lower'].value, '0');
  assert.equal(e['integral-expression'].value, 'x^2');
  e['integral-upper'].handlers.keydown({ key: 'ArrowDown', preventDefault() {} });
  assert.equal(focused(), 'integral-lower');
  e['integral-lower'].handlers.keydown({ key: 'ArrowUp', preventDefault() {} });
  assert.equal(focused(), 'integral-upper');
  e['integral-indefinite'].click();
  assert.equal(focused(), 'integral-expression');
  assert.equal(e['integral-edit-upper'].hidden, true);
  e['integral-definite'].click();
  assert.equal(focused(), 'integral-lower');
  assert.equal(e['integral-upper'].value, '7');
  e['integral-upper'].value = ''; e['integral-calculate'].click();
  assert.equal(focused(), 'integral-upper');
  assert.match(e['integral-result'].textContent, /Enter an upper bound/);
});

test('graph navigation, saved-function selection, domain gaps and invalid ranges', () => {
  const { elements: e, context, selected, c } = screen();
  assert.deepEqual(e['graph-function'].children.map(x => x.value), ['', 'f']);
  context.openGraphing(); assert.deepEqual(selected(), ['math', true]);
  assert.ok(e['graph-canvas'].children.some(n => n.attrs.d?.includes('L')));
  e['graph-function'].value = 'f'; e['graph-function'].onchange();
  assert.equal(e['graph-expression'].value, 'f(x)');
  e['graph-at'].value = '3'; e['graph-evaluate'].click(); assert.match(e['graph-result'].textContent, /y = 10/);
  e['graph-expression'].value = '1/x'; e['graph-plot'].click();
  const curve = e['graph-canvas'].children.find(n => n.attrs.d);
  assert.equal((curve.attrs.d.match(/M/g) || []).length, 2);
  e['graph-expression'].value = 'missing(x)'; e['graph-plot'].click(); assert.match(e['graph-result'].textContent, /Unknown function/);
  e['graph-xmin'].value = '10'; e['graph-plot'].click(); assert.match(e['graph-result'].textContent, /minimum/);
  assert.equal(c.answer, 0);
});

test('discrete form switches controls and evaluates sets and logic', () => {
  const { elements: e } = screen();
  e['discrete-operation'].value = 'intersection'; e['discrete-operation'].onchange();
  assert.equal(e['discrete-series'].hidden, true); assert.equal(e['discrete-sets'].hidden, false);
  e['discrete-calculate'].click(); assert.match(e['discrete-result'].textContent, /\{2, 3\}/);
  e['discrete-operation'].value = 'implies'; e['logic-p'].value = 'true'; e['logic-q'].value = 'false';
  e['discrete-calculate'].click(); assert.match(e['discrete-result'].textContent, /= false/);
});

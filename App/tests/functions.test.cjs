const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Calculator } = require('../functions.js');

test('definitions, numeric substitution, composition and redefinition', () => {
  const c = new Calculator();
  assert.equal(c.evaluate('f(x)=2x+3').kind, 'definition');
  assert.equal(c.evaluate('f(5)').value, 13);
  c.evaluate('g(t)=t^2');
  assert.equal(c.evaluate('f(g(2))').value, 11);
  c.evaluate('h(t)=f(g(t))+g(f(t))');
  assert.equal(c.evaluate('h(2)').value, 60);
  c.evaluate('f(x)=x-1');
  assert.equal(c.evaluate('h(2)').value, 4);
  assert.equal(c.evaluate('f(2)+g(3)').value, 10);
});

test('multiple parameters, local scope, implicit products and y notation', () => {
  const c = new Calculator();
  c.evaluate('h(x,y)=2x+3y+x(y+1)');
  assert.equal(c.evaluate('h(2,4)').value, 26);
  c.evaluate('y=x²+2x+1');
  assert.equal(c.evaluate('f(-3)').value, 4);
  assert.equal(c.evaluate('2f(2)+(2+1)(4+1)').value, 33);
  c.evaluate('g(t)=h(t, f(t))');
  assert.equal(c.evaluate('g(2)').value, 51);
});

test('calculator precedence and existing scientific functions', () => {
  const c = new Calculator();
  const examples = [
    ['2^3^2', 512], ['-2^2', -4], ['(-2)^2', 4], ['2^-3', 0.125],
    ['2**3', 8], ['2×3−4÷2', 4], ['sin(pi/2)', 1], ['cos(0)', 1],
    ['tan(0)', 0], ['asin(1)', Math.PI / 2], ['acos(1)', 0], ['atan(0)', 0],
    ['sqrt(9)+√(16)', 7], ['log(e)+ln(e)+log10(100)', 4],
    ['exp(0)+ceil(1.1)+floor(1.9)+abs(-2)+sign(-2)', 5],
    ['factorial(5)+3!', 126], ['|2-5|', 3], ['2π', 2 * Math.PI],
    ['1E-3+2e-3', .003], ['7%3', 1], ['1/100000000000', 1e-11],
  ];
  for (const [source, expected] of examples) assert.equal(c.evaluate(source).value, expected, source);
  c.evaluate('1/3');
  assert.equal(c.evaluate('Ans*3').value, 1);
});

test('bad definitions do not replace working definitions or break dependents', () => {
  const c = new Calculator();
  c.evaluate('f(x)=x+1');
  c.evaluate('g(t)=f(t)^2');
  for (const source of ['f(x)=z+1', 'f(x)=missing(x)', 'f(x)=f(x)', 'f(x)=g(x)',
    'f(x,y)=x+y', 'f(x,x)=x', 'sin(x)=x', 'f(pi)=pi', 'f()=2', 'f(x)=2+']) {
    assert.throws(() => c.evaluate(source), undefined, source);
    assert.equal(c.evaluate('g(2)').value, 9);
  }
});

test('invalid expressions and non-real results preserve the previous answer', () => {
  const c = new Calculator();
  c.evaluate('f(x)=1/x');
  c.evaluate('7');
  for (const source of ['f(0)', 'sqrt(-1)', 'log(0)', '1e999', 'factorial(-1)',
    'factorial(1.5)', 'factorial(171)', 'f(2,3)', 'f()', 'unknown(2)', 'x+1',
    '2+', '(2', '2)', 'sin(1,2)', 'Math.random()', 'alert(1)', 'constructor(1)',
    '2;3', '2[0]', '1..2', '1 2', '', '2+'.repeat(500)]) {
    assert.throws(() => c.evaluate(source), undefined, source);
    assert.equal(c.answer, 7);
  }
});

test('saved definitions restore with dependencies and captured Ans', () => {
  const c = new Calculator();
  c.evaluate('9');
  c.evaluate('f(x)=x+Ans');
  c.evaluate('g(x)=x^2');
  c.evaluate('f(x)=g(x)+Ans');
  c.evaluate('100');
  const restored = new Calculator();
  restored.restore(c.serialize());
  assert.equal(restored.evaluate('f(2)').value, 13);
  assert.throws(() => restored.restore('[{"source":"bad","answer":0}]'));
  assert.equal(restored.evaluate('f(2)').value, 13);
});

function ui(storage = new Map(), bootApp = false) {
  const element = () => ({ _value: '', textContent: '', dataset: {}, handlers: {}, children: [],
    get value() { return this._value; },
    set value(text) { this._value = text; this.selectionStart = this.selectionEnd = text.length; },
    classList: { active: false, contains() { return this.active; } },
    append(child) { this.children.push(child); }, replaceChildren() { this.children = []; },
    focus() { this.handlers.focus?.(); }, click() { this.handlers.click?.(); },
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
    setRangeText(text, start, end) {
      this.value = this.value.slice(0, start) + text + this.value.slice(end);
      this.setSelectionRange(start + text.length, start + text.length);
    },
    addEventListener(name, callback) { this.handlers[name] = callback; }, setAttribute() {} });
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const elements = Object.fromEntries([...html.matchAll(/id="([^"]+)"/g)].map(match => ['#' + match[1], element()]));
  const tabs = { basic: { dataset: { subtab: 'basic' } }, functions: { dataset: { subtab: 'functions' } } };
  elements['#function-name'].value = 'f'; elements['#function-parameters'].value = 'x';
  elements['#math'].classList.active = true; elements['#functions'].classList.active = true;
  const context = vm.createContext({ setTimeout: () => 1, clearTimeout() {}, AACFunctions: { Calculator }, lastResult: '',
    navigator: {}, speechSynthesis: { getVoices: () => [] },
    selectTab() { elements['#math'].classList.active = true; },
    selectSubtab(button) { for (const name of ['basic', 'functions']) elements['#' + name].classList.active = name === button.dataset.subtab; },
    document: { querySelector: selector => elements[selector] || tabs[/data-subtab="(\w+)"/.exec(selector)?.[1]],
      getElementById: id => elements['#' + id], querySelectorAll: () => [], createElement: element, addEventListener() {} },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } });
  context.window = context;
  if (bootApp) vm.runInContext(fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8'), context);
  context.module = { exports: {} };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../functions.js'), 'utf8'), context);
  context.module.exports.initializeFunctions();
  const enter = text => { elements['#display'].value = text; elements['#display'].handlers.keydown({ key: 'Enter', preventDefault() {} }); };
  return { context, elements, enter };
}

test('display integration saves definitions, evaluates Enter, updates history and retains errors', () => {
  const storage = new Map();
  let screen = ui(storage);
  screen.enter('f(x)=2x+3');
  assert.equal(screen.elements['#display'].value, 'f(x)=2x+3');
  assert.match(screen.elements['#status'].textContent, /Saved f\(x\)/);
  screen.enter('f(5)');
  assert.equal(screen.elements['#display'].value, '13');
  assert.equal(screen.context.lastResult, '13');
  screen.enter('f(1,2)');
  assert.equal(screen.elements['#display'].value, 'f(1,2)');
  assert.match(screen.elements['#status'].textContent, /expects 1 argument/);
  screen = ui(storage);
  screen.enter('f(4)');
  assert.equal(screen.elements['#display'].value, '11');
  screen.elements['#show-functions'].handlers.click();
  assert.match(screen.elements['#status'].textContent, /f\(x\)=2x\+3/);
});

test('page initializes without Chemistry and existing math buttons still use the calculator', () => {
  const { context, elements: e, enter } = ui(new Map(), true);
  assert.equal(e['#chemistry'], undefined);
  assert.equal(e['#letter-buttons'].children.length, 26);
  e['#functions'].classList.active = false; e['#basic'].classList.active = true;
  vm.runInContext("append('2'); append('+'); append('3'); window.evaluate();", context);
  assert.equal(e['#display'].value, '5');
  enter('f(x)=2x+3');
  e['#display'].value = 'f()'; e['#display'].setSelectionRange(2, 2);
  vm.runInContext("append('5'); window.evaluate();", context);
  assert.equal(e['#display'].value, '13');
});

test('function form, keypad, saved selection, editing and composition are usable without definition syntax', () => {
  const { elements: e, context } = ui();
  const key = label => context.insertFunctionValue(label);
  e['#function-rule'].focus();
  for (const label of ['2', 'x', '+', '3']) key(label);
  e['#save-function'].click();
  assert.equal(e['#saved-function'].value, 'f');
  assert.match(e['#function-result'].textContent, /Saved f\(x\)=2x\+3/);
  e['#function-arguments'].focus(); key('5');
  e['#evaluate-function'].click();
  assert.equal(e['#function-result'].textContent, 'f(5) = 13');
  e['#function-name'].value = 'g';
  e['#function-rule'].value = 'x^2'; e['#save-function'].click();
  e['#saved-function'].value = 'f'; e['#compose-function'].value = 'g';
  e['#function-arguments'].value = '2'; e['#evaluate-composition'].click();
  assert.equal(e['#function-result'].textContent, 'f(g(2)) = 11');
  e['#edit-function'].click();
  assert.equal(e['#function-rule'].value, '2x+3');
  e['#function-rule'].value = '3x'; e['#save-function'].click();
  e['#evaluate-function'].click();
  assert.equal(e['#display'].value, '6');
  assert.equal(context.lastResult, '6');
});

test('calculator inserts saved functions with the cursor inside parentheses and preserves other tabs', () => {
  const { elements: e, context, enter } = ui();
  enter('f(x)=2x+3');
  e['#use-function'].click();
  assert.equal(e['#basic'].classList.active, true);
  assert.equal(e['#display'].value, 'f()');
  assert.equal(context.insertFunctionValue('5'), true);
  assert.equal(e['#display'].value, 'f(5)');
  context.evaluate();
  assert.equal(e['#display'].value, '13');
  e['#use-function'].click();
  context.insertFunctionValue('56'); context.backspaceMath();
  assert.equal(e['#display'].value, 'f(5)');
  e['#math'].classList.active = false;
  assert.equal(context.insertFunctionValue('x'), false);
  assert.equal(context.backspaceMath(), false);
  assert.equal(e['#display'].value, 'f(5)');
});

test('missing selection and invalid rules report errors beside the function controls', () => {
  const { elements: e } = ui();
  e['#evaluate-function'].click();
  assert.match(e['#function-result'].textContent, /Choose a saved function/);
  e['#function-rule'].value = '2+'; e['#save-function'].click();
  assert.match(e['#function-result'].textContent, /Could not evaluate/);
  assert.equal(e['#saved-function'].children.length, 1);
  e['#function-rule'].value = '2x'; e['#save-function'].click();
  e['#evaluate-function'].click();
  assert.match(e['#function-result'].textContent, /Enter a value/);
});

test('unavailable or corrupt storage does not disable calculation', () => {
  const storage = { get() { return '{broken'; }, set() { throw Error('storage blocked'); } };
  const screen = ui(storage);
  assert.match(screen.elements['#status'].textContent, /could not be loaded/);
  screen.enter('f(x)=x^2');
  assert.match(screen.elements['#status'].textContent, /this session/);
  screen.enter('f(3)');
  assert.equal(screen.elements['#display'].value, '9');
});

test('MODE changes calculator trig units while graph compilation stays in radians', () => {
  const { context, enter, elements: e } = ui();
  context.toggleCalculatorMode(); enter('sin(30)');
  assert.equal(e['#display'].value, '0.5');
  enter('asin(0.5)'); assert.equal(e['#display'].value, '30');
  const c = context.mathCalculator;
  assert.ok(Math.abs(c.compile('sin(x)', ['x'])({ x: Math.PI / 2 }) - 1) < 1e-12);
  context.toggleCalculatorMode(); enter('sin(pi/2)'); assert.equal(e['#display'].value, '1');
});

test('sign toggle handles expressions, selections and an empty display', () => {
  const { context, elements: e } = ui();
  const field = e['#display'];
  field.value = '2+3'; context.toggleCalculatorSign(); context.evaluate(); assert.equal(field.value, '-5');
  context.toggleCalculatorSign(); context.evaluate(); assert.equal(field.value, '5');
  field.value = '2+3'; field.setSelectionRange(2, 3); context.toggleCalculatorSign(); context.evaluate(); assert.equal(field.value, '-1');
  field.value = ''; context.toggleCalculatorSign(); assert.equal(field.value, '-');
  context.toggleCalculatorSign(); assert.equal(field.value, '');
});

test('integer results keep all safe digits and invalid compiled variables are rejected', () => {
  const { enter, elements: e } = ui();
  enter('1085929983159840'); assert.equal(e['#display'].value, '1085929983159840');
  const c = new Calculator();
  assert.throws(() => c.compile('x', ['x'])({ x: Infinity }));
  assert.throws(() => c.compile('x', ['x'])({ x: NaN }));
});

test('equation history keeps successful expressions and excludes errors', () => {
  const { context, enter, elements: e } = ui();
  context.showEquationHistory(); assert.match(e['#status'].textContent, /empty/);
  enter('2+3'); enter('7*8'); enter('1/0');
  context.showEquationHistory();
  assert.match(e['#status'].textContent, /7\*8 = 56; 2\+3 = 5/);
  assert.doesNotMatch(e['#status'].textContent, /1\/0/);
});

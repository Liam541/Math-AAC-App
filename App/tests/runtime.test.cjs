const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const html = read('index.html');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);

function browser({ storage = null, speech = true, legacyCalculus = false } = {}) {
  const listeners = {}, elements = {}, played = [], paused = [], revoked = [], fallback = [];
  const timers = new Map(); let timerId = 0;
  class Element {
    constructor() { this.value = ''; this.children = []; this.dataset = {}; this.style = { setProperty() {} }; const classes = new Set(); this.classList = { toggle(key, on) { if (on) classes.add(key); else classes.delete(key); }, contains: key => classes.has(key) }; this.handlers = {}; }
    append(...children) { this.children.push(...children); }
    add(child) { this.append(child); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(type, handler) { (this.handlers[type] ||= []).push(handler); }
    setAttribute() {}
    querySelector() { return null; }
    querySelectorAll(selector) {
      if (this === elements['#math'] && selector === '.subpanel') return ['basic', 'algebra', 'calculus', 'greek', 'functions', 'graphing'].map(id => elements['#' + id]);
      if (this === elements['#math'] && selector === '.subtab') return Object.values(tabs);
      if (this === elements['#calculus'] && selector === 'input') return ['lower', 'upper', 'expression', 'variable'].map(part => elements['#integral-' + part]);
      return [];
    }
    closest(selector) { return selector === '.subject' ? elements['#math'] : null; }
    insertAdjacentHTML() {}
    focus() { this.handlers.focus?.forEach(handler => handler()); }
    select() { this.selectionStart = 0; this.selectionEnd = this.value.length; }
    click() { this.onclick?.(); this.handlers.click?.forEach(handler => handler()); }
    setRangeText(text, start, end) { this.value = this.value.slice(0, start) + text + this.value.slice(end); this.selectionStart = this.selectionEnd = start + text.length; }
  }
  for (const match of html.matchAll(/id="([^"]+)"/g)) elements['#' + match[1]] = new Element();
  for (const [selector, element] of Object.entries(elements)) element.id = selector.slice(1);
  for (const match of html.matchAll(/<input\b[^>]*\bid="([^"]+)"[^>]*value="([^"]*)"/g)) elements['#' + match[1]].value = match[2];
  const tabs = Object.fromEntries(['basic', 'algebra', 'calculus', 'greek', 'functions', 'graphing'].map(id => { const tab = new Element(); tab.dataset.subtab = id; return [id, tab]; }));
  const legacyBoard = new Element(); legacyBoard.dataset.buttons = 'calculus';
  elements['#math'].classList.toggle('active', true); elements['#basic'].classList.toggle('active', true);
  for (const [id, value] of Object.entries({ 'rate-range': '175', 'volume-range': '50', 'size-range': '18', 'function-name': 'f', 'function-parameters': 'x' })) elements['#' + id].value = value;
  elements['#auto-speak'].type = 'checkbox'; elements['#auto-speak'].checked = true;
  const requests = [];
  const context = vm.createContext({
    navigator: {}, AbortController,
    setTimeout: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; }, clearTimeout: id => timers.delete(id),
    localStorage: storage || { getItem: () => null, setItem() {} },
    document: { querySelector: selector => elements[selector] || tabs[/data-subtab="(\w+)"/.exec(selector)?.[1]] || new Element(), getElementById: id => elements['#' + id],
      querySelectorAll: selector => selector === '.subject' ? ['math', 'spell', 'communication', 'settings'].map(id => elements['#' + id]) : selector === '[data-buttons]' && legacyCalculus ? [legacyBoard] : [], createElement: () => new Element(), createElementNS: () => new Element(),
      addEventListener(type, handler) { (listeners[type] ||= []).push(handler); }, body: new Element(), documentElement: new Element() },
    Option: function (text, value) { this.textContent = text; this.value = value; },
    SpeechSynthesisUtterance: function (text) { this.text = text; },
    URL: { createObjectURL: () => 'blob:' + played.length, revokeObjectURL: url => revoked.push(url) },
    Audio: class { constructor(src) { this.src = src; } async play() { played.push(this); } pause() { paused.push(this); } },
    fetch(url, options) {
      if (url === '/api/tts-status') return Promise.resolve({ json: async () => ({}) });
      return new Promise((resolve, reject) => requests.push({ resolve, reject, options }));
    },
  });
  if (speech) context.speechSynthesis = { getVoices: () => [], cancel() {}, speak: utterance => fallback.push(utterance.text) };
  context.window = context;
  const boot = () => {
    vm.runInContext(read('app.js'), context);
    inline.forEach(source => vm.runInContext(source, context));
    vm.runInContext(read('functions.js'), context);
  };
  const response = { ok: true, blob: async () => ({}), headers: { get: key => key === 'X-TTS-Engine' ? 'kokoro' : null } };
  const flushInput = () => { for (const [id, timer] of [...timers]) if (timer.delay <= 200) { timers.delete(id); timer.fn(); } };
  return { context, elements, listeners, requests, played, paused, revoked, fallback, boot, response, legacyBoard, flushInput };
}

test('full page initializes without speech support or working settings storage', () => {
  for (const stored of ['{broken', 'null', '[]']) {
    const b = browser({ speech: false, storage: { getItem: () => stored, setItem() { throw Error('blocked'); } } });
    assert.doesNotThrow(b.boot);
    assert.equal(typeof b.context.evaluate, 'function');
    assert.equal(typeof b.context.openGraphing, 'function');
    b.elements['#display'].value = '2+3'; b.context.evaluate();
    assert.equal(b.elements['#display'].value, '5');
    assert.ok(b.listeners.click.length >= 3);
  }
});

test('auto-speak setting is honored and display editing respects the selection', () => {
  const b = browser(); b.boot();
  let spoken = 0; b.context.speak = () => { spoken++; };
  b.elements['#auto-speak'].checked = false;
  b.elements['#quick-phrases'].children[0].onclick(); assert.equal(spoken, 0);
  b.elements['#auto-speak'].checked = true;
  b.elements['#quick-phrases'].children[0].onclick(); assert.equal(spoken, 1);
  const display = b.elements['#display']; display.value = '123'; display.selectionStart = 1; display.selectionEnd = 2;
  vm.runInContext("append('9')", b.context); assert.equal(display.value, '193');
  const button = { dataset: { action: 'backspace' } };
  b.listeners.click[0]({ target: { closest: () => button } }); assert.equal(display.value, '13');
});

test('new speech cancels prior requests and prevents stale audio and fallback', async () => {
  const b = browser(); b.boot();
  const first = b.context.speak('first'), second = b.context.speak('second');
  assert.equal(b.requests[0].options.signal.aborted, true);
  b.requests[1].resolve(b.response); await second;
  b.requests[0].reject(Error('aborted')); await first;
  assert.equal(b.played.length, 1); assert.equal(b.fallback.length, 0);
  assert.equal(b.played[0].volume, .5);
  const third = b.context.speak('third'); assert.equal(b.paused.length, 1); assert.equal(b.revoked.length, 1);
  b.requests[2].resolve(b.response); await third;
  b.played[1].onended(); assert.equal(b.revoked.length, 2);
});

test('late successful responses cannot play over the latest speech', async () => {
  const b = browser(); b.boot();
  const first = b.context.speak('first'), second = b.context.speak('second');
  b.requests[1].resolve(b.response); await second;
  b.requests[0].resolve(b.response); await first;
  assert.equal(b.played.length, 1);
});

test('speech failures fall back without leaving an object URL allocated', async () => {
  const b = browser(); b.boot();
  b.context.Audio = class { constructor(src) { this.src = src; } async play() { throw Error('blocked'); } pause() {} };
  const speech = b.context.speak('hello'); b.requests[0].resolve(b.response); await speech;
  assert.deepEqual(b.fallback, ['hello']); assert.equal(b.revoked.length, 1);
});

test('service worker only removes this app caches and does not cache error responses', async () => {
  const handlers = {}, deleted = [], cached = [], pending = [];
  const context = vm.createContext({ URL, self: { addEventListener: (type, fn) => { handlers[type] = fn; }, clients: { claim() {} }, skipWaiting() {} },
    caches: { keys: async () => ['other-app-cache', 'math-aac-old'], delete: async key => deleted.push(key), match: async () => null,
      open: async () => ({ put: async request => cached.push(request) }) }, fetch: async () => ({ ok: false, clone() { return this; } }) });
  vm.runInContext(read('sw.js'), context);
  handlers.activate({ waitUntil: promise => pending.push(promise) }); await Promise.all(pending);
  assert.deepEqual(deleted, ['math-aac-old']);
  let result;
  handlers.fetch({ request: { method: 'GET', url: 'http://localhost/missing.js' }, respondWith: promise => { result = promise; }, waitUntil: promise => pending.push(promise) });
  await result; await Promise.all(pending); assert.equal(cached.length, 0);
});

test('the integral button opens a working editor and typing or keypad edits recalculate', () => {
  const b = browser(); b.boot();
  const e = b.elements;
  e['#display'].value = 'x^2';
  const integralButton = { dataset: { action: 'integral' } };
  b.listeners.click[0]({ target: { closest: () => integralButton } });
  assert.equal(e['#calculus'].classList.contains('active'), true);
  assert.equal(e['#display'].value, 'x^2');
  assert.match(e['#integral-result'].textContent, /0\.333333333333/);
  e['#integral-upper'].value = '3'; e['#integral-upper'].handlers.input.forEach(fn => fn()); b.flushInput();
  assert.match(e['#integral-result'].textContent, /≈ 9$/);
  e['#integral-edit-upper'].click();
  e['#integral-keypad-host'].children.at(-1).children.find(key => key.textContent === '2').click(); b.flushInput();
  assert.match(e['#integral-result'].textContent, /≈ 2\.66666666667$/);
  e['#integral-indefinite'].click(); assert.match(e['#integral-result'].textContent, /\+ C$/);
  e['#integral-expression'].value = 'x+'; e['#integral-expression'].handlers.input.forEach(fn => fn()); b.flushInput();
  assert.match(e['#integral-result'].textContent, /Could not calculate/);
  e['#integral-expression'].value = 'x*x'; e['#integral-expression'].handlers.input.forEach(fn => fn()); b.flushInput();
  assert.match(e['#integral-result'].textContent, /\+ C$/);
});

test('legacy integral button no longer inserts a non-solving text label', () => {
  const b = browser({ legacyCalculus: true }); b.boot();
  b.elements['#display'].value = 'x^2'; b.legacyBoard.children[0].onclick();
  assert.equal(b.elements['#display'].value, 'x^2');
  assert.match(b.elements['#integral-result'].textContent, /0\.333333333333/);
});

test('calculator solves live without overwriting an expression or changing Ans', () => {
  const b = browser(); b.boot(); const field = b.elements['#display'];
  b.context.mathCalculator.evaluate('7');
  field.value = 'integral(x^2,x,0,3)'; field.handlers.input.forEach(fn => fn()); b.flushInput();
  assert.equal(field.value, 'integral(x^2,x,0,3)');
  assert.equal(b.elements['#calculator-result'].textContent, '= 9');
  assert.equal(b.context.mathCalculator.answer, 7);
  field.value = 'Integral: x^2'; b.context.evaluate();
  assert.match(b.elements['#calculator-result'].textContent, /\+ C/);
  field.value = ''; field.selectionStart = field.selectionEnd = 0;
  for (const key of ['sqrt(', '9', ')']) vm.runInContext(`append(${JSON.stringify(key)})`, b.context);
  b.flushInput(); assert.equal(b.elements['#calculator-result'].textContent, '= 3');
});

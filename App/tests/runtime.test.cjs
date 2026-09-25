const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const html = read('index.html');
const pageScripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map(([, attributes, body]) => {
  const src = /src="([^"]+)"/.exec(attributes)?.[1];
  return src ? read(src.split('?')[0]) : body;
});

function browser({ storage = null, speech = true, legacyCalculus = false } = {}) {
  const listeners = {}, elements = {}, played = [], paused = [], revoked = [], fallback = [];
  const timers = new Map(); let timerId = 0;
  class Element {
    constructor() { this.value = ''; this.children = []; this.dataset = {}; this.style = { setProperty() {} }; const classes = new Set(); this.classList = { toggle(key, on) { if (on) classes.add(key); else classes.delete(key); }, contains: key => classes.has(key) }; this.handlers = {}; }
    append(...children) { this.children.push(...children); }
    add(child) { this.append(child); }
    replaceChildren(...children) { this.children = children; }
    addEventListener(type, handler) { (this.handlers[type] ||= []).push(handler); }
    setAttribute(key, value) { (this.attributes ||= {})[key] = value; }
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
    dispatchEvent(event) { this.handlers[event.type]?.forEach(handler => handler(event)); }
    get selectedOptions() { return this.children.filter(child => child.value === this.value); }
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
    select() { this.selectionStart = 0; this.selectionEnd = this.value.length; this.dispatchEvent({ type: 'select' }); }
    click() { this.onclick?.(); this.handlers.click?.forEach(handler => handler()); }
    setRangeText(text, start, end) { this.value = this.value.slice(0, start) + text + this.value.slice(end); this.selectionStart = this.selectionEnd = start + text.length; }
  }
  for (const match of html.matchAll(/id="([^"]+)"/g)) elements['#' + match[1]] = new Element();
  for (const [selector, element] of Object.entries(elements)) element.id = selector.slice(1);
  for (const match of html.matchAll(/<input\b[^>]*\bid="([^"]+)"[^>]*value="([^"]*)"/g)) elements['#' + match[1]].value = match[2];
  for (const match of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*\bhidden\b[^>]*>/g)) elements['#' + match[1]].hidden = true;
  for (const match of html.matchAll(/<[^>]*\bid="([^"]+)"[^>]*\bdisabled\b[^>]*>/g)) elements['#' + match[1]].disabled = true;
  const tabs = Object.fromEntries(['basic', 'algebra', 'calculus', 'greek', 'functions', 'graphing'].map(id => { const tab = new Element(); tab.dataset.subtab = id; return [id, tab]; }));
  const legacyBoard = new Element(); legacyBoard.dataset.buttons = 'calculus';
  elements['#math'].classList.toggle('active', true); elements['#basic'].classList.toggle('active', true);
  for (const [id, value] of Object.entries({ 'rate-range': '175', 'volume-range': '50', 'size-range': '18', 'function-name': 'f', 'function-parameters': 'x' })) elements['#' + id].value = value;
  elements['#calculator-template'].value = 'fraction';
  elements['#template-first-label'].textContent = 'Numerator (top)';
  elements['#template-second-label'].textContent = 'Denominator (bottom)';
  elements['#auto-speak'].type = 'checkbox'; elements['#auto-speak'].checked = true;
  const requests = [];
  const context = vm.createContext({
    navigator: {}, AbortController, Event,
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
    pageScripts.forEach(source => vm.runInContext(source, context));
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
    assert.ok(b.listeners.click.length >= 1);
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

test('Greek and calculator boards edit the selected integral through the shared bar', () => {
  const b = browser(); b.boot(); const e = b.elements;
  e['#integral-expression'].focus(); e['#integral-expression'].select();
  vm.runInContext('selectSubtab(document.querySelector(\'[data-subtab="greek"]\'))', b.context);
  e['#greek-letters'].children.find(button => button.textContent.startsWith('θ')).click();
  vm.runInContext("append('^2')", b.context);
  assert.equal(e['#display'].value, 'θ^2');
  assert.equal(e['#integral-expression'].value, 'θ^2');
  e['#integral-variable'].focus(); e['#integral-variable'].select();
  e['#greek-letters'].children.find(button => button.textContent.startsWith('θ')).click();
  e['#integral-upper'].value = '3';
  e['#shared-solve'].click(); b.flushInput();
  assert.match(e['#display'].value, /^∫ from 0 to 3 of \(θ\^2\) dθ ≈ 9$/);
  assert.equal(e['#shared-use-answer'].hidden, false);
  assert.equal(b.context.mathCalculator.answer, 9);
  e['#shared-use-answer'].click();
  vm.runInContext("append('+1')", b.context); e['#shared-solve'].click();
  assert.equal(e['#display'].value, '10');
  assert.equal(e['#integral-variable'].value, 'θ');
});

test('copying, typing, selection replacement and deleting stay synchronized across fields', () => {
  const b = browser(); b.boot(); const e = b.elements, shared = b.context.sharedMath;
  e['#display'].value = 'sin(θ)';
  e['#shared-use-display'].value = 'function-rule'; e['#shared-use-display'].onchange();
  assert.equal(e['#function-rule'].value, 'sin(θ)');
  e['#display'].setSelectionRange(4, 5); shared.edit('x');
  assert.equal(e['#function-rule'].value, 'sin(x)');
  shared.erase(); assert.equal(e['#function-rule'].value, 'sin()');
  shared.erase(true); assert.equal(e['#function-rule'].value, '');
  e['#display'].value = 'x^2'; e['#display'].dispatchEvent({ type: 'input' });
  assert.equal(e['#function-rule'].value, 'x^2');
  e['#shared-use-display'].value = 'graph-expression'; e['#shared-use-display'].onchange();
  assert.equal(e['#graph-expression'].value, 'x^2');
  e['#math-input-target'].value = ''; e['#math-input-target'].onchange();
  shared.erase(true); shared.edit('5');
  assert.equal(e['#graph-expression'].value, 'x^2');
});

test('integrals entered in the bar retain the solved equation and reopen in the editor', () => {
  const b = browser(); b.boot(); const e = b.elements;
  e['#display'].value = 'integral(θ^2,θ,0,3)'; b.context.evaluate(); b.flushInput();
  assert.match(e['#display'].value, /^∫ .*≈ 9$/);
  b.context.openIntegral();
  assert.equal(e['#integral-variable'].value, 'theta');
  assert.match(e['#integral-result'].textContent, /≈ 9$/);
  e['#integral-indefinite'].click(); e['#shared-solve'].click();
  assert.match(e['#display'].value, /^∫ .*\+ C$/);
  e['#shared-use-answer'].click();
  assert.doesNotMatch(e['#display'].value, /\+ C/);
  e['#integral-expression'].focus(); e['#integral-expression'].value = 'x+';
  e['#integral-expression'].dispatchEvent({ type: 'input' }); e['#shared-solve'].click();
  assert.match(e['#integral-result'].textContent, /Could not calculate/);
  assert.equal(e['#display'].value, 'x+');
  assert.equal(e['#shared-use-answer'].hidden, true);
});

test('shared integral speech includes the Greek variable, differential, and approximation', async () => {
  const b = browser(); b.boot();
  b.elements['#integral-expression'].value = 'θ^2'; b.elements['#integral-variable'].value = 'θ';
  b.context.solveIntegral();
  const speaking = b.context.speak();
  const spoken = JSON.parse(b.requests[0].options.body).text;
  assert.match(spoken, /integral .*theta .*with respect to theta .*approximately equals/);
  b.requests[0].resolve(b.response); await speaking;
  assert.equal(b.context.AACFunctions.speechSource('hello dude'), 'hello dude');
  assert.match(b.context.AACFunctions.speechSource('integral(θ^2,θ,0,3)'), /with respect to theta/);
});

test('calculator retains problem and answer with independent speech choices', () => {
  const b = browser(); b.boot(); const e = b.elements, spoken = [];
  b.context.speak = text => spoken.push(text);
  b.context.sharedMath.edit('2+3'); e['#shared-solve'].click(); b.flushInput();
  assert.equal(e['#calculator-problem'].textContent, '2+3');
  assert.equal(e['#calculator-answer'].textContent, '5');
  e['#speak-problem'].click(); e['#speak-answer'].click(); e['#speak-both'].click();
  assert.deepEqual(spoken, ['2+3', '5', '2+3 equals 5']);
  b.context.sharedMath.edit('+1');
  assert.equal(e['#speak-answer'].disabled, true);
  assert.equal(e['#speak-both'].disabled, true);
  assert.equal(e['#calculator-problem'].textContent, '5+1');
});

test('Undo recovers a solved equation, cleared input and cross-field replacements', () => {
  const b = browser(); b.boot(); const e = b.elements, shared = b.context.sharedMath;
  shared.edit('2+3'); e['#shared-solve'].click();
  shared.erase(true); e['#calculator-undo'].click(); b.flushInput();
  assert.equal(e['#display'].value, '5');
  assert.equal(e['#calculator-problem'].textContent, '2+3');
  assert.equal(e['#calculator-answer'].textContent, '5');
  e['#calculator-undo'].click(); b.flushInput();
  assert.equal(e['#display'].value, '2+3');
  assert.equal(e['#speak-answer'].disabled, true);
  e['#integral-expression'].focus(); e['#integral-expression'].select(); shared.edit('sin(x)');
  shared.erase(true); e['#calculator-undo'].click();
  assert.equal(e['#integral-expression'].value, 'sin(x)');
  assert.equal(e['#display'].value, 'sin(x)');
  e['#calculator-undo'].click(); assert.equal(e['#integral-expression'].value, 'x^2');
  shared.choose(null); e['#display'].value = 'cos(x)';
  e['#shared-use-display'].value = 'function-rule'; e['#shared-use-display'].onchange();
  e['#calculator-undo'].click();
  assert.equal(e['#function-rule'].value, ''); assert.equal(e['#display'].value, 'cos(x)');
});

test('Undo covers physical typing and speech phrases preserve the current equation', () => {
  const b = browser(); b.boot(); const e = b.elements, spoken = [];
  b.context.speak = text => spoken.push(text);
  b.context.sharedMath.edit('12');
  e['#display'].dispatchEvent({ type: 'beforeinput' });
  e['#display'].value = '123'; e['#display'].dispatchEvent({ type: 'input' });
  e['#calculator-undo'].click(); assert.equal(e['#display'].value, '12');
  e['#calculator-phrases'].children[0].click();
  assert.deepEqual(spoken, ['I need more time.']); assert.equal(e['#display'].value, '12');
  e['#calculator-phrase-text'].value = 'Please show another example.'; e['#calculator-save-phrase'].click();
  e['#calculator-phrases'].children[0].click();
  assert.equal(spoken.at(-1), 'Please show another example.'); assert.equal(e['#display'].value, '12');
});

test('Stop speaking cancels both pending requests and audio without late fallback', async () => {
  const b = browser(); b.boot();
  const first = b.context.speak('first'); b.elements['#calculator-stop'].click();
  assert.equal(b.requests[0].options.signal.aborted, true);
  b.requests[0].reject(Error('cancelled')); await first;
  assert.equal(b.fallback.length, 0); assert.equal(b.played.length, 0);
  const second = b.context.speak('second'); b.requests[1].resolve(b.response); await second;
  b.elements['#calculator-stop'].click();
  assert.equal(b.paused.length, 1); assert.equal(b.revoked.length, 1);
  const third = b.context.speak('third'); b.elements['#calculator-stop'].click();
  b.requests[2].resolve(b.response); await third;
  assert.equal(b.played.length, 1);
});

test('More functions leaves the main keys fixed and structured templates insert solvable math', () => {
  const b = browser(); b.boot(); const e = b.elements;
  e['#calculator-more'].click(); assert.equal(e['#calculator-more-panel'].hidden, false);
  assert.equal(e['#calculator-more'].attributes['aria-expanded'], 'true');
  e['#template-first'].value = '1+2'; e['#template-second'].value = '3';
  e['#calculator-insert-template'].click(); e['#shared-solve'].click();
  assert.equal(e['#display'].value, '1');
  b.context.sharedMath.erase(true);
  e['#calculator-template'].value = 'power'; e['#calculator-template'].onchange();
  assert.equal(e['#template-second-label'].textContent, 'Exponent (power)');
  e['#template-first'].value = '2'; e['#template-second'].value = '3';
  e['#calculator-insert-template'].click(); e['#shared-solve'].click();
  assert.equal(e['#display'].value, '8');
  assert.doesNotMatch(html, /data-action="second"/);
});

test('editing location, return button and integral guide track the actual field', () => {
  const b = browser(); b.boot(); const e = b.elements;
  e['#calculator-integral-guide'].click();
  assert.equal(b.context.sharedMath.target().id, 'integral-expression');
  assert.equal(e['#integral-expression'].classList.contains('linked-math-field'), true);
  e['#integral-guide-next'].click(); assert.equal(b.context.sharedMath.target().id, 'integral-variable');
  e['#integral-guide-next'].click(); assert.equal(b.context.sharedMath.target().id, 'integral-lower');
  e['#integral-guide-next'].click(); assert.equal(b.context.sharedMath.target().id, 'integral-upper');
  assert.equal(e['#integral-guide-next'].textContent, 'Solve integral');
  vm.runInContext('selectSubtab(document.querySelector(\'[data-subtab="greek"]\'))', b.context);
  e['#return-to-field'].click();
  assert.equal(e['#calculus'].classList.contains('active'), true);
  assert.match(e['#editing-location'].textContent, /upper bound/);
  e['#integral-guide-next'].click();
  assert.match(e['#calculator-problem'].textContent, /^∫ from/);
  assert.equal(e['#calculator-answer'].textContent, '≈ 0.333333333333');
});

test('calculator preferences persist, respect subject navigation, and tolerate malformed storage', () => {
  const stored = new Map();
  const storage = { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) };
  const b = browser({ storage }); b.boot(); const e = b.elements;
  e['#calculator-focus'].checked = true; e['#calculator-focus'].onchange();
  assert.equal(b.context.document.body.classList.contains('math-focus'), true);
  vm.runInContext("selectTab('spell')", b.context);
  assert.equal(b.context.document.body.classList.contains('math-focus'), false);
  vm.runInContext("selectTab('math')", b.context);
  assert.equal(b.context.document.body.classList.contains('math-focus'), true);
  e['#calculator-preview'].checked = false; e['#calculator-preview'].onchange();
  b.context.sharedMath.edit('2+3'); b.flushInput();
  assert.match(e['#calculator-result'].textContent, /Press Solve/);
  e['#shared-solve'].click(); assert.equal(e['#calculator-answer'].textContent, '5');
  const next = browser({ storage }); next.boot();
  assert.equal(next.elements['#calculator-focus'].checked, true);
  assert.equal(next.elements['#calculator-preview'].checked, false);
  assert.doesNotThrow(browser({ storage: { getItem: () => '{"preferences":5}', setItem() {} } }).boot);
});

test('incomplete expressions give a repair instruction and quiet mode waits for Solve', () => {
  const b = browser(); b.boot(); const e = b.elements;
  b.context.sharedMath.edit('sin(1'); e['#shared-solve'].click();
  assert.match(e['#calculator-result'].textContent, /Add a closing parenthesis/);
  assert.equal(e['#speak-answer'].disabled, true);
  b.context.sharedMath.erase(true); b.context.sharedMath.edit('2+'); e['#shared-solve'].click();
  assert.match(e['#calculator-result'].textContent, /after the last operator/);
  e['#calculator-preview'].checked = false; e['#calculator-preview'].onchange();
  e['#integral-expression'].focus(); e['#integral-expression'].select(); b.context.sharedMath.edit('x^2');
  b.flushInput(); assert.match(e['#integral-result'].textContent, /Press Solve/);
  e['#shared-solve'].click(); assert.match(e['#calculator-answer'].textContent, /^≈ /);
  const spoken = []; b.context.speak = text => spoken.push(text);
  e['#speak-answer'].click(); assert.match(spoken[0], /^approximately /);
});

test('failed solves do not consume Undo, and switching subjects retains a solved problem', () => {
  const b = browser(); b.boot(); const e = b.elements;
  b.context.sharedMath.edit('2+'); e['#shared-solve'].click(); e['#calculator-undo'].click();
  assert.equal(e['#display'].value, '');
  b.context.sharedMath.edit('2+3'); e['#shared-solve'].click();
  vm.runInContext("selectTab('settings'); selectTab('math')", b.context); b.flushInput();
  assert.equal(e['#calculator-problem'].textContent, '2+3');
  assert.equal(e['#calculator-answer'].textContent, '5');
  e['#integral-expression'].focus(); e['#integral-expression'].select();
  b.context.sharedMath.edit('x+'); e['#shared-solve'].click(); e['#calculator-undo'].click();
  assert.equal(e['#integral-expression'].value, 'x^2');
});

test('word insertion respects the cursor and spelling and quick phrases participate in Undo', () => {
  const b = browser(); b.boot(); const e = b.elements, bar = e['#display'];
  bar.value = 'I help'; bar.setSelectionRange(2, 2);
  vm.runInContext("append('need', true)", b.context);
  assert.equal(bar.value, 'I need help');
  e['#calculator-undo'].click(); assert.equal(bar.value, 'I help');
  const button = { dataset: { spell: '!' } };
  bar.setSelectionRange(bar.value.length, bar.value.length);
  b.listeners.click[0]({ target: { closest: () => button } });
  assert.equal(bar.value, 'I help!');
  e['#calculator-undo'].click(); assert.equal(bar.value, 'I help');
  e['#auto-speak'].checked = false;
  e['#quick-phrases'].children[0].click(); e['#calculator-undo'].click();
  assert.equal(bar.value, 'I help');
});

test('speech preserves AAC punctuation and reads powers and logarithms correctly', async () => {
  const b = browser(); b.boot();
  const cases = [['Thank you!', 'Thank you!'], ['2**3', '2 to the power of 3'], ['5!', '5 factorial '], ['ln(2)', 'natural log of 2 close parenthesis '], ['exp(2)', 'exponential of 2 close parenthesis ']];
  for (const [source, expected] of cases) {
    const pending = b.context.speak(source), request = b.requests.at(-1);
    assert.equal(JSON.parse(request.options.body).text, expected);
    request.resolve(b.response); await pending;
  }
});

test('audio error event plus rejected playback falls back only once', async () => {
  const b = browser(); b.boot();
  b.context.Audio = class {
    constructor(src) { this.src = src; }
    async play() { this.onerror(); throw Error('Playback failed'); }
    pause() {}
  };
  const pending = b.context.speak('hello'); b.requests[0].resolve(b.response); await pending;
  assert.deepEqual(b.fallback, ['hello']); assert.equal(b.revoked.length, 1);
});

test('settings changes update appearance and retain the fallback voice preference', () => {
  const saved = new Map(), b = browser({ storage: { getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) } });
  b.boot(); const e = b.elements;
  e['#theme-select'].value = 'warm'; e['#theme-select'].dispatchEvent({ type: 'change' });
  assert.equal(b.context.document.body.dataset.theme, 'warm');
  e['#voice-select'].value = 'Test voice'; e['#voice-select'].dispatchEvent({ type: 'change' });
  assert.equal(JSON.parse(saved.get('math-aac-settings'))['voice-select'], 'Test voice');
});

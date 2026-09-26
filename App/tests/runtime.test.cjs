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

function browser({ storage = null, speech = true } = {}) {
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
      if (this === elements['#math'] && selector === '.subpanel') return ['basic', 'scientific', 'algebra', 'calculus', 'greek', 'discrete', 'functions', 'graphing'].map(id => elements['#' + id]);
      if (this === elements['#math'] && selector === '.subtab') return Object.values(tabs);
      if (this === elements['#calculus'] && selector === 'input') return ['lower', 'upper', 'expression', 'variable'].map(part => elements['#integral-' + part]);
      return [];
    }
    closest(selector) {
      if (selector === '.subject') return elements['#math'];
      if (selector === '.subpanel') return elements[this.id.startsWith('function-') ? '#functions' : this.id.startsWith('greek-') ? '#greek' : '#graphing'];
      return null;
    }
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
  const tabs = Object.fromEntries(['basic', 'scientific', 'algebra', 'calculus', 'greek', 'discrete', 'functions', 'graphing'].map(id => { const tab = new Element(); tab.dataset.subtab = id; return [id, tab]; }));
  elements['#math'].classList.toggle('active', true); elements['#basic'].classList.toggle('active', true);
  for (const [id, value] of Object.entries({ 'rate-range': '175', 'volume-range': '50', 'size-range': '18', 'function-name': 'f', 'function-parameters': 'x' })) elements['#' + id].value = value;
  elements['#calculator-template'].value = 'fraction';
  elements['#template-first-label'].textContent = 'Numerator (top)';
  elements['#template-second-label'].textContent = 'Denominator (bottom)';
  const requests = [];
  const context = vm.createContext({
    navigator: {}, AbortController, Event,
    setTimeout: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; }, clearTimeout: id => timers.delete(id),
    localStorage: storage || { getItem: () => null, setItem() {} },
    document: { querySelector: selector => elements[selector] || tabs[/data-subtab="(\w+)"/.exec(selector)?.[1]] || new Element(), getElementById: id => elements['#' + id],
      querySelectorAll: selector => selector === '.subject' ? ['math', 'spell', 'appearance', 'settings'].map(id => elements['#' + id]) : [], createElement: () => new Element(), createElementNS: () => new Element(),
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
  if (speech) context.speechSynthesis = { getVoices: () => [{ name: 'Device voice', lang: 'en-US', localService: true }], cancel() {}, speak: utterance => fallback.push(utterance.text) };
  context.window = context;
  const boot = () => {
    pageScripts.forEach(source => vm.runInContext(source, context));
  };
  const response = { ok: true, blob: async () => ({}), headers: { get: key => key === 'X-TTS-Engine' ? 'kokoro' : null } };
  const flushInput = () => { for (const [id, timer] of [...timers]) if (timer.delay <= 200) { timers.delete(id); timer.fn(); } };
  return { context, elements, listeners, requests, played, paused, revoked, fallback, boot, response, flushInput };
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

test('display editing respects the selection', () => {
  const b = browser(); b.boot();
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
  e['#integral-upper'].focus(); e['#integral-upper'].select();
  b.context.sharedMath.edit('2'); b.flushInput();
  assert.match(e['#integral-result'].textContent, /≈ 2\.66666666667$/);
  e['#integral-indefinite'].click(); assert.match(e['#integral-result'].textContent, /\+ C$/);
  e['#integral-expression'].value = 'x+'; e['#integral-expression'].handlers.input.forEach(fn => fn()); b.flushInput();
  assert.match(e['#integral-result'].textContent, /Could not calculate/);
  e['#integral-expression'].value = 'x*x'; e['#integral-expression'].handlers.input.forEach(fn => fn()); b.flushInput();
  assert.match(e['#integral-result'].textContent, /\+ C$/);
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

test('typing, selection replacement and deleting stay synchronized across fields', () => {
  const b = browser(); b.boot(); const e = b.elements, shared = b.context.sharedMath;
  e['#function-rule'].focus(); shared.edit('sin(θ)');
  e['#display'].setSelectionRange(4, 5); shared.edit('x');
  assert.equal(e['#function-rule'].value, 'sin(x)');
  shared.erase(); assert.equal(e['#function-rule'].value, 'sin()');
  shared.erase(true); assert.equal(e['#function-rule'].value, '');
  e['#display'].value = 'x^2'; e['#display'].dispatchEvent({ type: 'input' });
  assert.equal(e['#function-rule'].value, 'x^2');
  e['#finish-field'].click(); shared.erase(true); shared.edit('5');
  assert.equal(e['#function-rule'].value, 'x^2');
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

test('compact result retains the equation and answer speech until editing', () => {
  const b = browser(); b.boot(); const e = b.elements, spoken = [];
  b.context.speak = text => spoken.push(text);
  b.context.sharedMath.edit('2+3'); e['#shared-solve'].click(); b.flushInput();
  assert.equal(e['#calculator-result'].textContent, '2+3 = 5');
  e['#speak-answer'].click(); assert.deepEqual(spoken, ['5']);
  b.context.sharedMath.edit('+1'); assert.equal(e['#speak-answer'].disabled, true);
});

test('Undo recovers a solved equation, cleared input and cross-field replacements', () => {
  const b = browser(); b.boot(); const e = b.elements, shared = b.context.sharedMath;
  shared.edit('2+3'); e['#shared-solve'].click();
  shared.erase(true); e['#calculator-undo'].click(); b.flushInput();
  assert.equal(e['#display'].value, '5');
  assert.equal(e['#calculator-result'].textContent, '2+3 = 5');
  e['#calculator-undo'].click(); b.flushInput();
  assert.equal(e['#display'].value, '2+3');
  assert.equal(e['#speak-answer'].disabled, true);
  e['#integral-expression'].focus(); e['#integral-expression'].select(); shared.edit('sin(x)');
  shared.erase(true); e['#calculator-undo'].click();
  assert.equal(e['#integral-expression'].value, 'sin(x)');
  assert.equal(e['#display'].value, 'sin(x)');
  e['#calculator-undo'].click(); assert.equal(e['#integral-expression'].value, 'x^2');

});

test('Undo covers physical typing', () => {
  const b = browser(); b.boot(); const e = b.elements;
  b.context.sharedMath.edit('12');
  e['#display'].dispatchEvent({ type: 'beforeinput' });
  e['#display'].value = '123'; e['#display'].dispatchEvent({ type: 'input' });
  e['#calculator-undo'].click(); assert.equal(e['#display'].value, '12');
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

test('structured templates insert solvable math', () => {
  const b = browser(); b.boot(); const e = b.elements;
  e['#template-first'].value = '1+2'; e['#template-second'].value = '3';
  e['#calculator-insert-template'].click(); e['#shared-solve'].click();
  assert.equal(e['#display'].value, '1');
  b.context.sharedMath.erase(true);
  e['#calculator-template'].value = 'power'; e['#calculator-template'].onchange();
  assert.equal(e['#template-second-label'].textContent, 'Exponent');
  e['#template-first'].value = '2'; e['#template-second'].value = '3';
  e['#calculator-insert-template'].click(); e['#shared-solve'].click();
  assert.equal(e['#display'].value, '8');
  assert.doesNotMatch(html, /data-action="second"/);
});

test('editing location and return button track the actual field', () => {
  const b = browser(); b.boot(); const e = b.elements;
  e['#integral-upper'].focus();
  assert.equal(e['#integral-upper'].classList.contains('linked-math-field'), true);
  b.context.selectSubtab(b.context.document.querySelector('[data-subtab="greek"]'));
  e['#return-to-field'].click();
  assert.equal(e['#calculus'].classList.contains('active'), true);
  assert.match(e['#editing-location'].textContent, /upper bound/);
  e['#finish-field'].click(); assert.equal(e['#field-context'].hidden, true);
});

test('calculator preferences persist, respect subject navigation, and tolerate malformed storage', () => {
  const stored = new Map();
  const storage = { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) };
  const b = browser({ storage }); b.boot(); const e = b.elements;
  e['#calculator-preview'].checked = false; e['#calculator-preview'].onchange();
  b.context.sharedMath.edit('2+3'); b.flushInput();
  assert.match(e['#calculator-result'].textContent, /Press Solve/);
  e['#shared-solve'].click(); assert.equal(e['#calculator-result'].textContent, '2+3 = 5');
  const next = browser({ storage }); next.boot();
  assert.equal(next.elements['#calculator-preview'].checked, false);
  assert.doesNotThrow(browser({ storage: { getItem: () => '{"preferences":5}', setItem() {} } }).boot);
});

test('incomplete expressions give a repair instruction and quiet mode waits for Solve', () => {
  const b = browser(); b.boot(); const e = b.elements;
  b.context.sharedMath.edit('sin(1'); e['#shared-solve'].click();
  assert.match(e['#calculator-result'].textContent, /Add a closing parenthesis/);
  assert.equal(e['#speak-answer'].disabled, true);
  b.context.sharedMath.erase(true); b.context.sharedMath.edit('2+'); e['#shared-solve'].click();
  assert.match(e['#calculator-result'].textContent, /after the operator/);
  e['#calculator-preview'].checked = false; e['#calculator-preview'].onchange();
  e['#integral-expression'].focus(); e['#integral-expression'].select(); b.context.sharedMath.edit('x^2');
  b.flushInput(); assert.match(e['#integral-result'].textContent, /Press Solve/);
  e['#shared-solve'].click(); assert.match(e['#calculator-result'].textContent, /≈ /);
  const spoken = []; b.context.speak = text => spoken.push(text);
  e['#speak-answer'].click(); assert.match(spoken[0], /^approximately /);
});

test('failed solves do not consume Undo, and switching subjects retains a solved problem', () => {
  const b = browser(); b.boot(); const e = b.elements;
  b.context.sharedMath.edit('2+'); e['#shared-solve'].click(); e['#calculator-undo'].click();
  assert.equal(e['#display'].value, '');
  b.context.sharedMath.edit('2+3'); e['#shared-solve'].click();
  vm.runInContext("selectTab('settings'); selectTab('math')", b.context); b.flushInput();
  assert.equal(e['#calculator-result'].textContent, '2+3 = 5');
  e['#integral-expression'].focus(); e['#integral-expression'].select();
  b.context.sharedMath.edit('x+'); e['#shared-solve'].click(); e['#calculator-undo'].click();
  assert.equal(e['#integral-expression'].value, 'x^2');
});

test('word insertion respects the cursor and spelling participates in Undo', () => {
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


test('Settings and Appearance stay accessible without breaking a linked math field', () => {
  const b = browser(); b.boot(); const e = b.elements;
  e['#integral-expression'].focus();
  for (const tab of ['settings', 'appearance', 'spell', 'math']) {
    b.context.selectTab(tab);
    assert.equal(e['#' + tab].classList.contains('active'), true);
    assert.equal(b.context.sharedMath.target().id, 'integral-expression');
  }
  assert.equal(e['#letter-buttons'].children.length, 26);
});

test('touch template fields restore the original destination on insertion', () => {
  const b = browser(); b.boot(); const e = b.elements;
  e['#integral-expression'].focus(); e['#integral-expression'].select();
  e['#template-first'].focus(); b.context.sharedMath.edit('1');
  e['#template-second'].focus(); b.context.sharedMath.edit('2');
  e['#calculator-insert-template'].click();
  assert.equal(e['#integral-expression'].value, '((1)/(2))');
  assert.equal(b.context.sharedMath.target().id, 'integral-expression');
  assert.equal(e['#template-first'].value, '1');
  assert.equal(e['#template-second'].value, '2');
});

test('speech requests select Kokoro without cloud settings', async () => {
  const b = browser(); b.boot();
  const pending = b.context.speak('Hello');
  const payload = JSON.parse(b.requests[0].options.body);
  assert.equal(payload.engine, 'kokoro');
  assert.equal(payload.voice, 'af_heart');
  assert.equal(b.elements['#google-voice'], undefined);
  b.requests[0].resolve(b.response); await pending;
});

test('fallback never selects a remote browser voice', async () => {
  const b = browser(); b.boot();
  b.context.speechSynthesis.getVoices = () => [{ name: 'Remote voice', localService: false }];
  b.context.loadVoices();
  const pending = b.context.speak('Hello');
  b.requests[0].reject(Error('No local server')); await pending;
  assert.equal(b.fallback.length, 0);
  assert.match(b.elements['#status'].textContent, /Local speech unavailable/);
});

test('form evaluation and definition saving each undo in a single step', () => {
  const stored = new Map();
  const b = browser({ storage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) } }); b.boot();
  const e = b.elements;
  e['#function-rule'].value = '2x+3'; e['#function-rule'].focus();
  e['#save-function'].click();
  assert.equal(b.context.mathCalculator.definitions.size, 1);
  e['#calculator-undo'].click();
  assert.equal(e['#display'].value, '2x+3');
  assert.equal(b.context.sharedMath.target().id, 'function-rule');
  assert.equal(b.context.mathCalculator.definitions.size, 0);
  assert.equal(stored.get('math-aac-functions-v1'), '[]');
  e['#save-function'].click();
  e['#function-arguments'].value = '5'; e['#function-arguments'].focus();
  e['#evaluate-function'].click(); assert.equal(e['#display'].value, '13');
  e['#calculator-undo'].click();
  assert.equal(e['#display'].value, '5');
  assert.equal(b.context.sharedMath.target().id, 'function-arguments');
});

test('invalid function saves preserve the linked bar and do not add an Undo entry', () => {
  const b = browser(); b.boot(); const e = b.elements;
  e['#function-rule'].value = '2+'; e['#function-rule'].focus();
  e['#save-function'].click();
  assert.equal(e['#display'].value, '2+');
  assert.equal(b.context.sharedMath.target().id, 'function-rule');
  assert.equal(e['#calculator-undo'].disabled, true);
});

test('graph selection and window reset keep the linked bar synchronized and undoable', () => {
  const b = browser(); b.boot(); const e = b.elements;
  b.context.mathCalculator.define('f(x)=x+1');
  e['#graph-expression'].focus(); e['#graph-function'].value = 'f'; e['#graph-function'].onchange();
  assert.equal(e['#display'].value, 'f(x)');
  e['#calculator-undo'].click(); assert.equal(e['#display'].value, 'x^2');
  e['#graph-xmin'].value = '-3'; e['#graph-xmin'].focus();
  e['#graph-reset'].click(); assert.equal(e['#display'].value, '-10');
  e['#calculator-undo'].click(); assert.equal(e['#display'].value, '-3');
});

test('speech explains comparisons, superscripts, scientific notation and empty input', async () => {
  const b = browser(); b.boot();
  await b.context.speak('  ');
  assert.equal(b.requests.length, 0);
  assert.match(b.elements['#status'].textContent, /Input math or a message/);
  for (const [source, expected] of [
    ['x!=2', 'x not equal to 2'], ['2<=3', '2 less than or equal to 3'],
    ['x²', 'x squared'], ['1E-3', '1 times ten to the power of minus 3'],
    ['floor(2.5)', 'floor of 2.5 close parenthesis'], ['5%2', '5 modulo 2'],
    ['Π A ∖ B', 'product A set difference B'], ['Thank you!', 'Thank you!']
  ]) {
    const pending = b.context.speak(source), request = b.requests.at(-1);
    assert.equal(JSON.parse(request.options.body).text.replace(/\s+/g, ' ').trim(), expected);
    request.resolve(b.response); await pending;
  }
});

test('AAC spells complete sentences and submits one unchanged utterance to either voice engine', async () => {
  const b = browser(); b.boot(); const e = b.elements;
  b.context.selectTab('spell');
  const sentence = "i need a pen, please. i'm ready!";
  for (const letter of sentence) b.listeners.click[0]({ target: { closest: () => ({ dataset: { spell: letter } }) } });
  assert.equal(e['#display'].value, sentence);
  assert.equal(b.requests.length, 0, 'Letter presses must not speak individually');
  const pending = b.context.speak();
  assert.equal(b.requests.length, 1);
  assert.equal(JSON.parse(b.requests[0].options.body).text, sentence);
  b.requests[0].reject(Error('use device voice')); await pending;
  assert.deepEqual(b.fallback, [sentence]);
  b.context.selectTab('settings');
  const repeat = b.context.speak();
  assert.equal(JSON.parse(b.requests[1].options.body).text, sentence);
  b.requests[1].resolve(b.response); await repeat;
});

test('letter borrowing retains the math destination and message mode detaches without changing the field', async () => {
  const b = browser(); b.boot(); const e = b.elements;
  e['#integral-expression'].focus(); e['#integral-expression'].select();
  b.context.selectTab('spell');
  b.listeners.click[0]({ target: { closest: () => ({ dataset: { spell: 'x' } }) } });
  assert.equal(e['#integral-expression'].value, 'x');
  assert.equal(e['#display'].dataset.entryMode, 'math');
  e['#spell-message-mode'].click(); b.context.sharedMath.erase(true);
  b.context.sharedMath.edit('I got an A!');
  assert.equal(e['#integral-expression'].value, 'x');
  assert.equal(b.context.sharedMath.target(), null);
  const pending = b.context.speak();
  assert.equal(JSON.parse(b.requests[0].options.body).text, 'I got an A!');
  b.requests[0].resolve(b.response); await pending;
});

test('Greek examples create usable drafts, preserve saved functions, and respect angle mode', () => {
  const b = browser(); b.boot(); const e = b.elements;
  b.context.mathCalculator.define('f(x)=x+7');
  b.context.toggleCalculatorMode();
  e['#greek-letters'].children.find(button => button.textContent.startsWith('θ')).click();
  e['#greek-example'].click();
  assert.equal(e['#function-arguments'].value, '90');
  assert.notEqual(e['#function-name'].value, 'f');
  e['#save-function'].click(); e['#evaluate-function'].click();
  assert.equal(e['#display'].value, '1');
  assert.equal(b.context.mathCalculator.evaluate('f(1)').value, 8);
  e['#greek-letters'].children.find(button => button.textContent.startsWith('σ')).click();
  e['#greek-example'].click(); e['#save-function'].click(); e['#evaluate-function'].click();
  assert.equal(e['#display'].value, '1');
  e['#greek-letters'].children.find(button => button.textContent.startsWith('π')).click();
  e['#greek-example'].click(); b.context.evaluate();
  assert.ok(Math.abs(Number(e['#display'].value) - 6 * Math.PI) < 1e-9);
});

test('discrete tasks offer focused choices, usable examples and meaningful result speech', async () => {
  const b = browser(); b.boot(); const e = b.elements;
  for (const [op, expected] of [['sum', '10'], ['product', '24'], ['choose', '10'], ['permute', '20'], ['intersection', '{banana}'], ['difference', '{apple}']]) {
    b.context.selectDiscreteOperation(op); e['#discrete-example'].click(); e['#discrete-calculate'].click();
    assert.ok(e['#discrete-result'].textContent.includes(expected), op);
    assert.ok(e['#discrete-operation'].children.length <= 3);
    assert.equal(e['#discrete-result'].dataset.valid, 'true');
  }
  b.context.selectDiscreteOperation('implies'); e['#discrete-example'].click(); e['#discrete-calculate'].click();
  assert.match(e['#discrete-result'].dataset.spoken, /I have a pencil is true/);
  assert.match(e['#discrete-result'].dataset.spoken, /is false\.$/);
  const pending = b.context.speak(e['#discrete-result'].dataset.spoken, { literal: true });
  assert.match(JSON.parse(b.requests[0].options.body).text, /If I have a pencil, then I have paper/);
  b.requests[0].resolve(b.response); await pending;
  b.context.selectDiscreteOperation('choose'); e['#count-r'].value = '6'; e['#discrete-calculate'].click();
  assert.equal(e['#discrete-result'].dataset.valid, 'false');
  e['#discrete-speak'].click(); assert.equal(b.requests.length, 1);
});

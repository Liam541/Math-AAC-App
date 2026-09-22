const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup() {
  const values = { 'engine-select': 'google', 'google-voice': 'en-US-Neural2-F', 'kokoro-voice': 'af_heart', 'voice-select': '', 'rate-range': '175', 'volume-range': '40' };
  const elements = Object.fromEntries(Object.entries(values).map(([k, value]) => [k, { value }])); elements.status = {};
  const audios = [], spoken = [], pending = [], revoked = [], timers = new Map(); let nextTimer = 0;
  const context = { console, AbortController, Map, document: { getElementById: id => elements[id] },
    setTimeout: callback => { timers.set(++nextTimer, callback); return nextTimer; }, clearTimeout: id => timers.delete(id),
    URL: { createObjectURL: () => 'blob:' + audios.length, revokeObjectURL: value => revoked.push(value) },
    fetch: (_url, { signal }) => new Promise((resolve, reject) => { pending.push({ resolve, reject }); signal.addEventListener('abort', () => reject(Error('Aborted'))); }),
    Audio: class { constructor(url) { this.src = url; this.paused = false; audios.push(this); } async play() { this.played = true; } pause() { this.paused = true; } removeAttribute() {} },
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    addEventListener: () => {}, speechSynthesis: { cancel: () => {}, speak: u => spoken.push(u), getVoices: () => [] },
  };
  context.window = context;
  vm.createContext(context); vm.runInContext(fs.readFileSync(path.join(__dirname, '../speech.js'), 'utf8'), context);
  const resolve = index => pending[index].resolve({ ok: true, blob: async () => ({ size: 500 }) });
  return { api: context.AACSpeech, elements, audios, spoken, pending, revoked, timers, resolve };
}
test('successful server playback respects volume, interrupts old audio, caches, and cleans URLs', async () => {
  const s = setup(); const first = s.api.speak('Hello'); s.resolve(0); await first;
  assert.equal(s.audios[0].volume, 0.4); assert.equal(s.audios[0].played, true);
  await s.api.speak('Hello');
  assert.equal(s.pending.length, 1); assert.equal(s.audios[0].paused, true); assert.equal(s.revoked.length, 1);
  s.api.stop(); assert.equal(s.audios[1].paused, true); assert.equal(s.revoked.length, 2); assert.equal(s.timers.size, 0);
});
test('canceled server request never falls back or plays later; timeout does fall back', async () => {
  const s = setup(); const first = s.api.speak('Old'); s.api.stop(); await first;
  assert.equal(s.spoken.length, 0); assert.equal(s.audios.length, 0);
  const second = s.api.speak('Current'); [...s.timers.values()][0](); await second;
  assert.equal(s.spoken.length, 1); assert.equal(s.spoken[0].text, 'Current'); assert.equal(s.spoken[0].volume, 0.4);
});
test('new request wins and plain text punctuation is preserved', async () => {
  const s = setup(); const old = s.api.speak('Old'); const current = s.api.speak('Current'); s.resolve(1); await Promise.all([old, current]);
  assert.equal(s.audios.length, 1); assert.equal(s.spoken.length, 0);
  s.elements['engine-select'].value = 'device'; await s.api.speak('Thank you!'); assert.equal(s.spoken[0].text, 'Thank you!');
  await s.api.speak('asin(1)**2 != 3', true); assert.match(s.spoken[1].text, /inverse sine.*to the power of.*not equal to/);
  s.elements['volume-range'].value = '0'; await s.api.speak('Muted'); assert.equal(s.spoken.length, 2);
});

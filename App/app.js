/* AAC messages, offline math, preferences, and the Desmos portal. */
'use strict';
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const display = $('#display'), math = window.AACMath, voice = window.AACSpeech;
let activeTab = 'math', lastResult = 0, secondMode = false, serverStatus = null;
let phraseEditing = -1;
const undo = [];
const defaultPhrases = ['I need help', 'I have a question', "I'm ready", "I don't understand", 'Can you repeat that?', 'I need more time', 'Thank you'];
const settingControls = $$('[data-setting]');
function setStatus(message) { $('#status').textContent = message; }
function readStored(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
let settings = readStored('math-aac-settings', {});
if (!settings || typeof settings !== 'object' || Array.isArray(settings)) settings = {};
let phrases = readStored('math-aac-phrases', defaultPhrases);
if (!Array.isArray(phrases) || phrases.length > 20 || phrases.some(p => typeof p !== 'string' || !p.trim() || p.length > 300)) phrases = [...defaultPhrases];
function store(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { setStatus('Changes work for this session. Browser storage is unavailable, so they cannot be saved.'); }
}
function updateEngineStatus() {
  const engine = $('#engine-select').value, selected = voice.selectedVoice();
  let message;
  if (engine === 'device') message = !window.speechSynthesis ? 'Device speech is unavailable. Choose an installed server engine or another browser.' : selected ? `${selected.localService ? 'On-device' : 'Online device'} voice: ${selected.name}. ${selected.localService ? 'No cloud request is needed.' : 'This voice may need internet.'}` : 'Waiting for the device voice list. Speech uses the system default.';
  else if (engine === 'kokoro') message = serverStatus?.kokoro ? 'Kokoro is installed. Models load on first use; device speech is the timeout fallback.' : 'Kokoro installation has not been confirmed. Device speech is the fallback.';
  else message = serverStatus?.google_configured && serverStatus?.google_cloud ? 'Google Cloud is configured. Device speech is the timeout fallback.' : 'Google Cloud is not configured or could not be checked. Device speech is the fallback.';
  $('#engine-status').textContent = message;
}
function applySettings(persist = true) {
  for (const control of settingControls) {
    const { id } = control;
    // Keep a saved voice when the OS voice list is still loading.
    if (id !== 'voice-select' || control.value) settings[id] = control.type === 'checkbox' ? control.checked : control.value;
  }
  document.body.dataset.theme = settings['theme-select'];
  document.body.dataset.accent = settings['accent-select'];
  for (const [property, id] of [['--font', 'size'], ['--target', 'target'], ['--gap', 'gap'], ['--icon', 'icon']]) document.documentElement.style.setProperty(property, settings[id + '-range'] + 'px');
  document.documentElement.style.setProperty('--tile', Number(settings['target-range']) * 2 + 'px');
  document.documentElement.style.setProperty('--key', Number(settings['target-range']) * 1.25 + 'px');
  settingControls.filter(control => control.type === 'range').forEach(control => {
    const unit = control.id === 'rate-range' ? (Number(control.value) / 175).toFixed(2) + '×' : control.value + (control.id === 'volume-range' ? '%' : ' px');
    $('#' + control.id.replace('-range', '-value')).textContent = unit;
  });
  $$('[data-action="angle"]').forEach(control => { control.textContent = settings['angle-mode'].toUpperCase(); });
  $('#kokoro-settings').hidden = settings['engine-select'] !== 'kokoro';
  $('#google-settings').hidden = settings['engine-select'] !== 'google';
  updateEngineStatus();
  if (persist) store('math-aac-settings', settings);
}
function restoreSettings() {
  for (const control of settingControls) {
    const { id } = control;
    if (id === 'voice-select') continue;
    const saved = settings[id];
    if (saved === undefined) continue;
    if (control.type === 'checkbox') { if (typeof saved === 'boolean') control.checked = saved; }
    else if (control.tagName === 'SELECT') { if ([...control.options].some(o => o.value === saved)) control.value = saved; }
    else if (Number.isFinite(Number(saved))) control.value = Math.max(Number(control.min), Math.min(Number(control.max), Number(saved)));
  }
  applySettings(false);
}
function speak(text = display.value, mode = $('#speech-mode').value) { voice.speak(text, mode === 'math' || (mode === 'auto' && (display.dataset.speechMode || (['math', 'graphing'].includes(activeTab) ? 'math' : 'plain')) === 'math')); }
function rememberEdit() { if (undo.at(-1) !== display.value) undo.push(display.value); if (undo.length > 50) undo.shift(); }
function insertInto(input, value, space = false) {
  if (input === display) { rememberEdit(); display.dataset.speechMode = space || activeTab !== 'math' ? 'plain' : 'math'; }
  const start = input.selectionStart ?? input.value.length, end = input.selectionEnd ?? start;
  const prefix = space && start && !/\s$/.test(input.value.slice(0, start)) ? ' ' : '';
  input.setRangeText(prefix + value, start, end, 'end');
  // Keep focus on the button for keyboard/switch use and avoid opening the software keyboard.
}
function backspace(input) {
  if (input === display) rememberEdit();
  const end = input.selectionEnd ?? input.value.length, start = input.selectionStart ?? end;
  const previous = [...input.value.slice(0, start)].at(-1) || '';
  input.setRangeText('', start === end ? Math.max(0, start - previous.length) : start, end, 'end');
}
function replaceDisplay(value) { rememberEdit(); display.value = value; display.dataset.speechMode = ['math', 'graphing'].includes(activeTab) ? 'math' : 'plain'; display.setSelectionRange(value.length, value.length); }
function selectTab(tab) {
  if (!document.getElementById(tab)?.classList.contains('subject')) return;
  activeTab = tab;
  document.body.dataset.page = tab;
  $$('.subject').forEach(section => section.classList.toggle('active', section.id === tab));
  $$('[data-tab]').forEach(button => { const selected = button.dataset.tab === tab; button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected)); });
  setStatus((document.getElementById(tab).querySelector('h2')?.textContent || tab) + ' selected.');
  if (tab === 'graphing' && !$('#desmos').hasAttribute('src') && navigator.onLine) loadDesmos();
}
function loadDesmos() {
  const frame = $('#desmos');
  frame.hidden = false;
  frame.src = frame.dataset.src;
  setStatus('Opening Desmos. If it does not appear, use Open Desmos in a new tab.');
}
function selectSubtab(button) {
  const parent = button.closest('.subject');
  parent.querySelectorAll('.subtab').forEach(item => { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', String(item === button)); });
  parent.querySelectorAll('.subpanel').forEach(panel => panel.classList.toggle('active', panel.id === button.dataset.subtab));
}
const sets = {
  algebra: [['x', 'x'], ['y', 'y'], ['=', ' = '], ['≠', ' ≠ '], ['≤', ' ≤ '], ['≥', ' ≥ '], ['<', ' < '], ['>', ' > '], ['Power', '^'], ['Absolute value', 'abs(']],
  calculus: [['∫ Integral', '∫ '], ['d/dx', 'd/dx '], ['Limit', 'limit as x → '], ['Σ Sum', 'Σ '], ['dx', ' dx'], ['∞', '∞'], ['From', ' from '], ['To', ' to ']],
  greek: [...'αβγδθλμσφω∧∨∩∪→∀∃∈'].map(c => [c, c]),
  functions: [['sin', 'sin('], ['cos', 'cos('], ['tan', 'tan('], ['sin⁻¹', 'asin('], ['cos⁻¹', 'acos('], ['tan⁻¹', 'atan('], ['√ Square root', 'sqrt('], ['∛ Cube root', 'cbrt('], ['ln (base e)', 'ln('], ['log (base 10)', 'log('], ['eˣ', 'exp('], ['n!', '!'], ['Ceiling', 'ceil('], ['Floor', 'floor('], ['Absolute value', 'abs('], ['nCr', 'ncr('], ['nPr', 'npr('], ['Remainder', 'mod('], ['Comma', ','], ['Close )', ')']],
  words: ['I', 'need', 'want', 'like', 'feel', 'more', 'less', 'to', 'go', 'stop', 'because', 'today'].map(word => [word, word]),
};
function button(label, callback) { const b = document.createElement('button'); b.className = 'button'; b.textContent = label; b.addEventListener('click', callback); return b; }
function makeButtons() {
  // Repeated controls share one implementation and keep native button semantics.
  const icons = { math: '∑', spell: 'Aa', communication: '☰', graphing: '↗', history: '◷', appearance: '◐', settings: '⚙' };
  $$('[data-tab]').forEach(control => {
    const icon = document.createElement('span'); icon.className = 'nav-icon'; icon.ariaHidden = 'true'; icon.textContent = icons[control.dataset.tab]; control.prepend(icon);
  });
  $$('.stepper input').forEach(input => {
    const label = $(`label[for="${input.id}"]`).textContent.trim();
    for (const direction of [-1, 1]) {
      const control = document.createElement('button'); control.className = 'button'; control.textContent = direction < 0 ? '−' : '+';
      control.dataset.step = input.id; control.dataset.delta = direction * Number(input.step);
      control.setAttribute('aria-label', `${direction < 0 ? 'Decrease' : 'Increase'} ${label}`);
      if (direction < 0) input.before(control); else input.after(control);
    }
  });
  for (const [id, characters] of [['letter-buttons', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'], ['number-buttons', '1234567890']]) {
    for (const character of characters) { const key = document.createElement('button'); key.className = 'button'; key.textContent = character; key.dataset.spell = character; $('#' + id).append(key); }
  }
  $$('[data-buttons]').forEach(container => sets[container.dataset.buttons].forEach(([label, value]) => container.append(button(label, () => insertInto(display, value, container.dataset.buttons === 'words')))));

}
function usePhrase(text) { replaceDisplay(text); display.dataset.speechMode = 'plain'; if ($('#auto-speak').checked) speak(text, 'plain'); else setStatus('Phrase added. Press Speak when ready.'); }
function renderPhrases() {
  $('#quick-phrases').replaceChildren(); $('#phrase-editor').replaceChildren();
  phrases.forEach((text, index) => {
    $('#quick-phrases').append(button(text, () => usePhrase(text)));
    const row = document.createElement('div'); row.className = 'phrase-row';
    row.append(button(text, () => usePhrase(text)), button('Edit', () => { phraseEditing = index; $('#phrase-input').value = text; $('#phrase-input').focus(); }), button('Remove', () => {
      phrases.splice(index, 1); phraseEditing = -1; $('#phrase-input').value = ''; renderPhrases(); setStatus('Phrase removed.'); store('math-aac-phrases', phrases);
    }));
    row.children[1].setAttribute('aria-label', 'Edit phrase: ' + text); row.children[2].setAttribute('aria-label', 'Remove phrase: ' + text);
    $('#phrase-editor').append(row);
  });
}
const options = () => ({ angle: $('#angle-mode').value, ans: lastResult });
function record(expression, value) {
  lastResult = value;
  const angle = $('#angle-mode').value, list = $('#history-list');
  const row = document.createElement('div'); row.className = 'history-row';
  const text = document.createElement('p'); text.textContent = `${expression} = ${math.format(value)} (${angle})`;
  row.append(text, button('Restore expression', () => { selectTab('math'); selectSubtab($('[data-subtab="basic"]')); replaceDisplay(expression); $('#angle-mode').value = angle; applySettings(); }), button('Speak result', () => speak(text.textContent, 'math')));
  list.querySelector(':scope > p')?.remove(); list.prepend(row);
  if (list.children.length > 30) list.lastElementChild.remove();
}
function evaluateDisplay() { const expression = display.value, value = math.evaluate(expression, options()); record(expression, value); replaceDisplay(math.format(value)); setStatus(expression + ' = ' + math.format(value)); }
function moveCursor(input, delta) { const position = Math.max(0, Math.min(input.value.length, (input.selectionStart ?? 0) + delta)); input.setSelectionRange(position, position); }
let lastButton = null, lastActivation = 0;
document.addEventListener('click', event => {
  const target = event.target.closest('button'); if (!target) return;
  const now = performance.now(), delay = Number($('#repeat-select').value);
  if (target.dataset.action !== 'stop' && target === lastButton && now - lastActivation < delay) { event.preventDefault(); event.stopImmediatePropagation(); return; }
  lastButton = target; lastActivation = now;
}, true);
document.addEventListener('click', event => {
  const target = event.target.closest('button'); if (!target) return;
  try {
    if (target.dataset.tab) { selectTab(target.dataset.tab); return; }
    if (target.dataset.subtab) { selectSubtab(target); return; }
    if (target.dataset.value !== undefined || target.dataset.spell !== undefined) { insertInto(display, target.dataset.value ?? target.dataset.spell); return; }
    if (target.dataset.step) { const input = $('#' + target.dataset.step); input.value = Math.max(Number(input.min), Math.min(Number(input.max), Number(input.value) + Number(target.dataset.delta))); applySettings(); return; }
    const action = target.dataset.action;
    switch (action) {
      case 'speak': speak(); break;
      case 'stop': voice.stop(); break;
      case 'test-voice': speak('This is my voice. I need more time to explain my answer.', 'plain'); break;
      case 'backspace': backspace(display); break;
      case 'clear': replaceDisplay(''); setStatus('Display cleared. Undo edit can restore it.'); break;
      case 'undo': if (undo.length) { display.value = undo.pop(); display.setSelectionRange(display.value.length, display.value.length); } break;
      case 'cursor-left': moveCursor(display, -1); break;
      case 'cursor-right': moveCursor(display, 1); break;
      case 'evaluate': evaluateDisplay(); break;
      case 'negate': { const start = display.selectionStart, end = display.selectionEnd; if (start !== end) insertInto(display, '-(' + display.value.slice(start, end) + ')'); else replaceDisplay(display.value ? '-(' + display.value + ')' : '-'); break; }
      case 'angle': $('#angle-mode').value = $('#angle-mode').value === 'rad' ? 'deg' : 'rad'; applySettings(); setStatus('Angle mode: ' + $('#angle-mode').value); break;
      case 'second': secondMode = !secondMode; $$('.secondable').forEach(key => { key.textContent = secondMode ? key.dataset.secondaryLabel : key.dataset.primaryLabel; key.dataset.value = secondMode ? key.dataset.secondaryValue : key.dataset.primaryValue; key.setAttribute('aria-label', key.textContent); }); target.setAttribute('aria-pressed', String(secondMode)); target.classList.toggle('selected', secondMode); break;
      case 'save-phrase': {
        const text = $('#phrase-input').value.trim(); if (!text) throw Error('Enter a phrase to save.');
        if (phraseEditing < 0) { if (phrases.length >= 20) throw Error('You can save up to 20 phrases. Edit or remove an existing phrase.'); phrases.push(text); } else phrases[phraseEditing] = text;
        phraseEditing = -1; $('#phrase-input').value = ''; renderPhrases(); setStatus('Phrase saved.'); store('math-aac-phrases', phrases); break;
      }
      case 'cancel-phrase': phraseEditing = -1; $('#phrase-input').value = ''; break;
      case 'phrase-from-display': $('#phrase-input').value = display.value.slice(0, 300); setStatus('Display copied to the phrase editor. Choose Save phrase.'); break;
      case 'load-desmos': loadDesmos(); break;
      case 'reload-app': store('math-aac-draft', display.value); location.reload(); break;
    }
  } catch (error) {
    setStatus(error.message);
  }
});
display.addEventListener('beforeinput', rememberEdit);
display.addEventListener('input', () => { display.dataset.speechMode = ['math', 'graphing'].includes(activeTab) ? 'math' : 'plain'; });
display.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); if (activeTab === 'math') { try { evaluateDisplay(); } catch (error) { setStatus(error.message); } } else speak(); } });
document.addEventListener('keydown', event => { if (event.key === 'Escape') voice.stop(); });
for (const control of settingControls) control.addEventListener('input', () => { const { id } = control; if (id === 'engine-select' || id === 'voice-select') voice.stop(false); if (id === 'voice-select') settings[id] = control.value; applySettings(); });
restoreSettings(); makeButtons(); renderPhrases(); voice.loadVoices(settings['voice-select']); updateEngineStatus(); selectTab('math');
window.speechSynthesis?.addEventListener('voiceschanged', () => { voice.loadVoices(settings['voice-select']); updateEngineStatus(); });
fetch('/api/tts-status', { cache: 'no-store' }).then(response => { if (!response.ok) throw Error(); return response.json(); }).then(info => { serverStatus = info; updateEngineStatus(); }).catch(() => {});
if ('serviceWorker' in navigator) {
  const wasControlled = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (wasControlled) $('#update-notice').hidden = false; });
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).catch(() => {});
}
const savedDraft = readStored('math-aac-draft', null);
if (typeof savedDraft === 'string') { replaceDisplay(savedDraft); store('math-aac-draft', null); }

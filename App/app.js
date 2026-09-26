/* Speech, display, calculator evaluation, dynamic boards, and tab navigation. */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(registration => registration.update()).catch(() => {});
const display = document.querySelector('#display');
const status = document.querySelector('#status');
const speech = window.speechSynthesis;
let voices = [], lastResult = '';
const sets = {
  algebra:[['x','x'],['y','y'],['a','a'],['b','b'],['=',' = '],['≠',' != '],['<',' < '],['>',' > '],['^','**'],['|x|','abs(']],
  functions:[['sin','sin('],['cos','cos('],['tan','tan('],['√','sqrt('],['ln','log('],['log₁₀','log10('],['eˣ','exp('],['!','factorial('],['⌈x⌉','ceil('],['⌊x⌋','floor('],['|x|','abs('],['sin⁻¹','asin('],['cos⁻¹','acos('],['tan⁻¹','atan(']],

};
function setStatus(message) { status.textContent = message; }
function append(value, space = false) {
  const start = display.selectionStart ?? display.value.length;
  const end = display.selectionEnd ?? start;
  const text = (space && start && !/\s/.test(display.value[start - 1]) ? ' ' : '') + value
    + (space && end < display.value.length && !/\s/.test(display.value[end]) ? ' ' : '');
  if (window.sharedMath) {
    if (space) window.sharedMath.choose(null);
    window.sharedMath.edit(text);
    return;
  }
  if (!space && window.insertFunctionValue?.(value)) return;
  display.setRangeText(text, start, end, 'end');
  display.focus();
  window.scheduleCalculatorPreview?.();
}
function makeButtons() {
  for (const letter of 'abcdefghijklmnopqrstuvwxyz, ') {
    const button = document.createElement('button');
    button.className = 'button'; button.textContent = letter === ' ' ? 'Space' : letter;
    button.dataset.spell = letter; document.getElementById('letter-buttons').append(button);
  }
  document.querySelectorAll('[data-buttons]').forEach(container => {
    sets[container.dataset.buttons].forEach(([label, value]) => {
      const button = document.createElement('button');
      button.className = 'button'; button.textContent = label;
      button.onclick = () => append(value);
      container.append(button);
    });
  });
}
function loadVoices() {
  voices = speech?.getVoices() || [];
  const select = document.querySelector('#voice-select');
  let previous = select.value;
  try { previous = previous || JSON.parse(localStorage.getItem('math-aac-settings') || '{}')?.['voice-select']; } catch (_) {}
  select.innerHTML = '';
  voices.forEach(voice => {
    const option = document.createElement('option');
    option.value = option.textContent = voice.name;
    select.append(option);
  });
  const preferred = voices.find(v => /zira|aria|jenny|samantha|hazel/i.test(v.name));
  if (voices.some(v => v.name === previous)) select.value = previous;
  else if (preferred) select.value = preferred.name;
}
function selectTab(tab) {

  document.querySelectorAll('.main-tabs .tab').forEach(button => {
    const selected = button.dataset.tab === tab;
    button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
  });
  document.querySelectorAll('.subject').forEach(section => section.classList.toggle('active', section.id === tab));
  window.calculatorAccess?.subjectChanged();
}
function selectSubtab(button) {
  const parent = button.closest('.subject');
  document.getElementById('math-stage').dataset.panel = button.dataset.subtab;
  parent.querySelectorAll('.subtab').forEach(item => {
    item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', String(item === button));
  });
  parent.querySelectorAll('.subpanel').forEach(panel => panel.classList.toggle('active', panel.id === button.dataset.subtab));
}
function showToolPage(id) {
  const page = document.getElementById(id), panel = page.closest('.subpanel');
  panel.querySelectorAll('.tool-page').forEach(item => item.classList.toggle('active', item === page));
  panel.querySelectorAll('[data-page]').forEach(button => {
    const selected = button.dataset.page === id;
    button.classList.toggle('active', selected); button.setAttribute('aria-pressed', String(selected));
  });
}
document.addEventListener('click', event => {
  const target = event.target.closest('button');
  if (!target) return;
  if (target.dataset.tab) { selectTab(target.dataset.tab); return; }
  if (target.dataset.page) { showToolPage(target.dataset.page); if (target.hasAttribute('data-plot-return')) document.getElementById('graph-plot').click(); return; }
  if (target.dataset.subtab) { selectSubtab(target); return; }
  if (target.dataset.value) { append(target.dataset.value); return; }
  if (target.dataset.spell !== undefined) { append(target.dataset.spell); return; }
  switch (target.dataset.action) {
    case 'speak': window.speak(); break;
    case 'backspace':
      if (window.backspaceMath?.()) break;
      const end = display.selectionEnd ?? display.value.length;
      const start = display.selectionStart ?? end;
      display.setRangeText('', start === end ? Math.max(0, start - 1) : start, end, 'end');
      display.focus(); window.scheduleCalculatorPreview?.(); break;
    case 'clear':
      if (window.sharedMath) window.sharedMath.erase(true);
      else display.value = '';
      window.scheduleCalculatorPreview?.(); break;
    case 'integral': window.openIntegral(); break;
    case 'evaluate': (window.sharedMath?.solve || window.evaluate)(); break;
    case 'mode': window.toggleCalculatorMode(); break;
    case 'sign': window.toggleCalculatorSign(); break;
    case 'graph': window.openGraphing(); break;
    case 'history': window.showEquationHistory(); break;
    case 'test-voice': window.speak('This is your selected voice.'); break;
  }
});
if (speech) speech.onvoiceschanged = loadVoices;
makeButtons();
loadVoices();
initializeSpeech();

function initializeSettings() {
  const googleVoiceSelect = document.querySelector('#google-voice');
  if (googleVoiceSelect && !googleVoiceSelect.querySelector('option[value="en-US-Chirp3-HD-Achernar"]')) {
    googleVoiceSelect.insertAdjacentHTML('afterbegin', '<option value="en-US-Chirp3-HD-Achernar">English US - Chirp 3 HD Achernar</option>');
  }
  if (googleVoiceSelect) googleVoiceSelect.value = 'en-US-Chirp3-HD-Achernar';
  let savedSettings = {};
  try {
    const saved = JSON.parse(localStorage.getItem('math-aac-settings') || '{}');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) savedSettings = saved;
  } catch (_) { /* Settings are optional; storage failures must not interrupt startup. */ }
  const settingIds = ['theme-select', 'size-range', 'google-voice', 'kokoro-voice', 'rate-range', 'volume-range', 'voice-select'];
  settingIds.forEach(id => {
    const control = document.querySelector('#' + id);
    if (!control || savedSettings[id] === undefined) return;
    if (control.type === 'checkbox') control.checked = savedSettings[id];
    else control.value = savedSettings[id];
  });
  function applyGlobalSettings() {
    const settings = {};
    settingIds.forEach(id => {
      const control = document.querySelector('#' + id);
      if (!control) return;
      settings[id] = control.type === 'checkbox' ? control.checked : control.value;
    });
    document.body.dataset.theme = settings['theme-select'] || 'light';
    document.documentElement.style.setProperty('--font', (settings['size-range'] || 18) + 'px');
    try { localStorage.setItem('math-aac-settings', JSON.stringify(settings)); } catch (_) { /* Keep session settings when storage is unavailable. */ }
  }
  settingIds.forEach(id => document.querySelector('#' + id)?.addEventListener('input', applyGlobalSettings));
  settingIds.forEach(id => document.querySelector('#' + id)?.addEventListener('change', applyGlobalSettings));
  applyGlobalSettings();
  fetch('/api/tts-status').then(response => response.json()).then(info => {
    const engineStatus = document.querySelector('.engine-status');
    if (!engineStatus) return;
    engineStatus.textContent = info.google_configured ? 'Online: Google Cloud. Offline fallback: Kokoro.' : 'Online voice needs Google credentials. Offline fallback: Kokoro.';
  }).catch(() => {});
}

function initializeSpeech() {
  const speechWords = [
    ['cos⁻¹', 'inverse cosine '],
    ['sin⁻¹', 'inverse sine '],
    ['tan⁻¹', 'inverse tangent '],
    ['log₁₀', 'log base ten '],
    ['⌈x⌉', 'ceiling '],
    ['⌊x⌋', 'floor '],
    ['|x|', 'absolute value '],
    ['eˣ', 'exponential '],
    ['∫', 'integral '],
    ['Σ', 'summation '],
    ['≠', 'not equal '],
    ['≤', 'less than or equal to '],
    ['≥', 'greater than or equal to '],
    ['∧', 'and '],
    ['∨', 'or '],
    ['∩', 'intersection '],
    ['∪', 'union '],
    ['→', 'implies '],
    ['∀', 'for all '],
    ['∃', 'there exists '],
    ['∈', 'is an element of '],
    ['α', 'alpha '],
    ['β', 'beta '],
    ['γ', 'gamma '],
    ['δ', 'delta '],
    ['θ', 'theta '],
    ['λ', 'lambda '],
    ['μ', 'mu '],
    ['σ', 'sigma '],
    ['φ', 'phi '],
    ['ω', 'omega '],
    ['acos(', 'inverse cosine of '],
    ['asin(', 'inverse sine of '],
    ['atan(', 'inverse tangent of '],
    ['cos(', 'cosine of '],
    ['sin(', 'sine of '],
    ['tan(', 'tangent of '],
    ['ln(', 'natural log of '],
    ['exp(', 'exponential of '],
    ['sqrt(', 'square root of '],
    ['log10(', 'log base ten of '],
    ['log(', 'natural log of '],
    ['factorial(', 'factorial of '],
    ['π', 'pi'],
    ['∞', 'infinity'],
    ['√', 'square root'],
    ['×', ' multiplied by '],
    ['**', ' to the power of '],
    ['*', ' multiplied by '],
    ['÷', ' divided by '],
    ['/', ' divided by '],
    ['+', ' plus '],
    ['−', ' minus '],
    ['-', ' minus '],
    ['^', ' to the power of '],
    ['=', ' equals '],
    ['(', ' open parenthesis '],
    [')', ' close parenthesis '],
  ];
  function browserSpeak(spoken) {
    if (!window.speechSynthesis) { document.querySelector('#status').textContent = 'Speech is unavailable on this device. Your message is still in the display.'; return; }
    const utterance = new SpeechSynthesisUtterance(spoken);
    const selected = document.querySelector('#voice-select').value;
    utterance.voice = speechSynthesis.getVoices().find(voice => voice.name === selected) || null;
    utterance.rate = Number(document.querySelector('#rate-range').value) / 175;
    utterance.volume = Number(document.querySelector('#volume-range').value) / 100;
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
    document.querySelector('#status').textContent = 'Speaking with browser fallback.';
  }
  let speechRequest = 0, speechController = null, currentAudio = null;
  function stopCurrentAudio() {
    if (!currentAudio) return;
    currentAudio.pause();
    URL.revokeObjectURL(currentAudio.src);
    currentAudio = null;
  }
  window.stopSpeaking = () => {
    ++speechRequest;
    speechController?.abort();
    speechController = null;
    stopCurrentAudio();
    window.speechSynthesis?.cancel();
    document.querySelector('#status').textContent = 'Speech stopped.';
  };
  window.speak = async function (text = document.querySelector('#display').value) {
    if (!text.trim()) return;
    const requestId = ++speechRequest;
    speechController?.abort();
    stopCurrentAudio();
    window.speechSynthesis?.cancel();
    let spoken = window.AACFunctions?.speechSource(text) || text;
    // Preserve punctuation in AAC messages; pronounce factorial notation after an operand.
    spoken = spoken === '!' ? 'factorial' : spoken.replace(/(\d|\)|\b[a-z])(!+)/gi,
      (_match, operand, marks) => operand + ' factorial '.repeat(marks.length));
    for (const [symbol, words] of speechWords) spoken = spoken.replaceAll(symbol, words);
    document.querySelector('#status').textContent = 'Preparing Google Cloud speech...';
    const controller = new AbortController();
    speechController = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    let usedBrowserFallback = false;
    const fallbackToBrowser = () => {
      if (requestId !== speechRequest || usedBrowserFallback) return;
      usedBrowserFallback = true;
      stopCurrentAudio();
      browserSpeak(spoken);
    };
    try {
      const response = await fetch('/api/speak', { signal: controller.signal, method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({engine: 'google', text: spoken, voice: document.querySelector('#google-voice').value, kokoro_voice: document.querySelector('#kokoro-voice').value, speed: Number(document.querySelector('#rate-range').value) / 175, volume: Number(document.querySelector('#volume-range').value)}) });
      if (!response.ok) throw new Error('Speech service unavailable');
      const blob = await response.blob();
      if (requestId !== speechRequest) return;
      const audio = new Audio(URL.createObjectURL(blob));
      currentAudio = audio;
      const usedEngine = response.headers.get('X-TTS-Engine') || 'cloud';
      const usedVoice = response.headers.get('X-TTS-Voice') || document.querySelector('#google-voice').value;
      const fallback = response.headers.get('X-TTS-Fallback-Reason');
      if (usedEngine === 'kokoro') audio.volume = Number(document.querySelector('#volume-range').value) / 100;
      audio.onended = () => { URL.revokeObjectURL(audio.src); if (currentAudio === audio) currentAudio = null; };
      audio.onerror = () => {
        if (requestId !== speechRequest) return;
        fallbackToBrowser();
      };
      await audio.play();
      if (requestId !== speechRequest) return;
      document.querySelector('#status').textContent = fallback ? `Speaking with ${usedEngine} (${usedVoice}). Google fallback: ${fallback}` : `Speaking with ${usedEngine}: ${usedVoice}`;
    } catch (_error) {
      fallbackToBrowser();
    } finally {
      clearTimeout(timeout);
      if (speechController === controller) speechController = null;
    }
  };
}

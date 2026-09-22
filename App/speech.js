/* One speech controller owns cancellation, playback, voice selection, and fallback. */
window.AACSpeech = (() => {
  const speech = window.speechSynthesis;
  let voices = [], generation = 0, request = null, audio = null, url = null, utterance = null;
  const cache = new Map();
  const control = id => document.getElementById(id);
  const status = text => { control('status').textContent = text; };
  function selectedVoice() {
    return voices.find(v => v.voiceURI === control('voice-select').value) || voices.find(v => v.localService && /^en\b/i.test(v.lang)) || voices.find(v => v.localService) || voices.find(v => v.default) || voices[0];
  }
  function loadVoices(preference = '') {
    const select = control('voice-select');
    if (!speech) { select.replaceChildren(new Option('Device speech unavailable in this browser', '')); return; }
    voices = speech.getVoices().sort((a, b) => Number(b.localService) - Number(a.localService));
    select.replaceChildren(new Option('Automatic (prefer on-device English)', ''));
    voices.forEach(v => select.add(new Option(`${v.name} · ${v.lang} · ${v.localService ? 'on device' : 'online'}`, v.voiceURI)));
    const saved = voices.find(v => v.voiceURI === preference || v.name === preference);
    if (saved) select.value = saved.voiceURI;
  }
  function releaseAudio() {
    if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); audio.removeAttribute('src'); audio = null; }
    if (url) URL.revokeObjectURL(url);
    url = null;
  }
  function stop(report = true) {
    generation++; request?.abort(); request = null; speech?.cancel(); utterance = null; releaseAudio();
    if (report) status('Speech stopped.');
  }
  function mathText(text) {
    const names = { asin: 'inverse sine', acos: 'inverse cosine', atan: 'inverse tangent', sin: 'sine', cos: 'cosine', tan: 'tangent', sqrt: 'square root', cbrt: 'cube root', ln: 'natural logarithm', log: 'logarithm base ten', log10: 'logarithm base ten', abs: 'absolute value', factorial: 'factorial', exp: 'exponential', ceil: 'ceiling', floor: 'floor', ncr: 'combinations', npr: 'permutations' };
    const symbols = { 'π': 'pi', '∞': 'infinity', '∫': 'integral', 'Σ': 'sum', '≠': 'not equal to', '≤': 'less than or equal to', '≥': 'greater than or equal to', '<': 'less than', '>': 'greater than', '∧': 'and', '∨': 'or', '∩': 'intersection', '∪': 'union', '→': 'implies', '∀': 'for all', '∃': 'there exists', '∈': 'is an element of', 'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta', 'θ': 'theta', 'λ': 'lambda', 'μ': 'mu', 'σ': 'sigma', 'φ': 'phi', 'ω': 'omega', '!': 'factorial', '%': 'percent', '^': 'to the power of', '×': 'times', '*': 'times', '÷': 'divided by', '/': 'divided by', '+': 'plus', '-': 'minus', '−': 'minus', '=': 'equals', '≈': 'approximately equals', '(': 'open parenthesis', ')': 'close parenthesis', '√': 'square root', '²': 'squared' };
    return text.replace(/\b(\d+(?:\.\d*)?)[eE]([+-]?\d+)\b/g, '$1 times ten to the power of $2')
      .replace(/\*\*/g, '^').replace(/!=/g, ' not equal to ').replace(/<=/g, ' less than or equal to ').replace(/>=/g, ' greater than or equal to ')
      .replace(/\b(asin|acos|atan|sin|cos|tan|sqrt|cbrt|ln|log10|log|abs|factorial|exp|ceil|floor|ncr|npr)\b/g, name => names[name])
      .replace(/[π∞∫Σ≠≤≥<>∧∨∩∪→∀∃∈αβγδθλμσφω!%^×*÷/+\-−=≈()√²]/g, c => ' ' + symbols[c] + ' ').replace(/\s+/g, ' ').trim();
  }
  function deviceSpeak(text, id, fallback = false) {
    if (id !== generation) return;
    if (!speech || !window.SpeechSynthesisUtterance) { status('Speech is unavailable in this browser. Your message remains on screen.'); return; }
    utterance = new SpeechSynthesisUtterance(text);
    const voice = selectedVoice();
    if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
    utterance.rate = Number(control('rate-range').value) / 175;
    utterance.volume = Number(control('volume-range').value) / 100;
    utterance.onstart = () => { if (id === generation) status((fallback ? 'Server speech unavailable; speaking with ' : 'Speaking with ') + (voice?.name || 'the system voice') + '.'); };
    utterance.onend = () => { if (id === generation) { status('Speech finished.'); utterance = null; } };
    utterance.onerror = event => { if (id === generation && !['canceled', 'interrupted'].includes(event.error)) status('Device speech failed. Select another voice in Settings.'); };
    status(fallback ? 'Switching to device speech.' : 'Starting device speech.');
    speech.speak(utterance);
  }
  async function speak(text, asMath = false) {
    if (!text.trim()) { status('Enter a message to speak.'); return; }
    if (text.length > 2000) { status('Speak a message of up to 2,000 characters at a time.'); return; }
    stop(false);
    const id = generation, spoken = asMath ? mathText(text) : text;
    if (control('volume-range').value === '0') { status('Speech is muted. Increase volume in Settings.'); return; }
    const engine = control('engine-select').value;
    if (engine === 'device') { deviceSpeak(spoken, id); return; }
    const payload = { text: spoken, engine, voice: control('google-voice').value, kokoro_voice: control('kokoro-voice').value, speed: Number(control('rate-range').value) / 175 };
    const key = JSON.stringify(payload), controller = new AbortController(); request = controller;
    const timeout = setTimeout(() => controller.abort(), 4500);
    status('Preparing ' + (engine === 'kokoro' ? 'local Kokoro' : 'Google Cloud') + ' speech…');
    let fallingBack = false;
    const fallback = () => { if (id === generation && !fallingBack) { fallingBack = true; releaseAudio(); deviceSpeak(spoken, id, true); } };
    try {
      let blob = cache.get(key);
      if (!blob) {
        const response = await fetch('/api/speak', { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json' }, body: key });
        if (!response.ok) throw Error('Speech unavailable.');
        blob = await response.blob();
        if (id !== generation) return;
        if (blob.size < 4 * 1024 * 1024) { cache.set(key, blob); if (cache.size > 12) cache.delete(cache.keys().next().value); }
      }
      clearTimeout(timeout);
      if (id !== generation) return;
      url = URL.createObjectURL(blob); audio = new Audio(url);
      audio.volume = Number(control('volume-range').value) / 100;
      audio.onended = () => { if (id === generation) { releaseAudio(); status('Speech finished.'); } };
      audio.onerror = fallback;
      await audio.play();
      if (id === generation && !fallingBack) status('Speaking with ' + engine + '.');
    } catch { fallback(); }
    finally { clearTimeout(timeout); if (request === controller) request = null; }
  }
  window.addEventListener('pagehide', () => stop(false));
  return { speak, stop, loadVoices, selectedVoice, mathText };
})();

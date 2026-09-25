/* Predictable editing, speech choices, and optional calculator supports. */
(function () {
  'use strict';
  const get = id => document.getElementById(id), bar = get('display');
  const defaults = ['I need more time.', 'Please explain this step.', 'That is not what I meant.', 'I want to show my work.', 'My answer is different.'];
  const preferenceIds = ['calculator-plain', 'calculator-roomy', 'calculator-focus', 'calculator-still', 'calculator-preview'];
  let preferences = {}, phrases = [...defaults], solution = null;
  try {
    const saved = JSON.parse(localStorage.getItem('math-aac-calculator-access-v1') || '{}');
    if (saved && typeof saved === 'object') {
      preferences = saved.preferences && typeof saved.preferences === 'object' && !Array.isArray(saved.preferences) ? saved.preferences : {};
      if (Array.isArray(saved.phrases) && saved.phrases.length === defaults.length) {
        phrases = saved.phrases.map((text, index) => typeof text === 'string' && text.trim() ? text.slice(0, 160) : defaults[index]);
      }
    }
  } catch (_) { /* Optional preferences must never prevent math entry. */ }
  function save() {
    try { localStorage.setItem('math-aac-calculator-access-v1', JSON.stringify({ preferences, phrases })); }
    catch (_) { setStatus('Preferences apply for this session. This browser could not save them.'); }
  }
  function applyPreferences() {
    for (const id of preferenceIds) preferences[id] = get(id).checked;
    get('math').classList.toggle('roomy-keys', preferences['calculator-roomy']);
    get('math').classList.toggle('still-keys', preferences['calculator-still']);
    document.body.classList.toggle('math-focus', preferences['calculator-focus'] && get('math').classList.contains('active'));
    document.querySelectorAll('[data-plain-label]').forEach(key => {
      key.textContent = preferences['calculator-plain'] ? key.dataset.plainLabel : key.dataset.shortLabel;
      key.setAttribute('aria-label', key.dataset.plainLabel);
    });
    get('calculator-result').setAttribute('aria-live', 'off');
  }
  for (const id of preferenceIds) {
    get(id).checked = typeof preferences[id] === 'boolean' ? preferences[id] : ['calculator-plain', 'calculator-still', 'calculator-preview'].includes(id);
    get(id).onchange = () => { applyPreferences(); save(); window.scheduleCalculatorPreview(); };
  }
  function problem() {
    return solution?.problem || (window.sharedMath.target()?.id.startsWith('integral-') ? window.integralSource() : bar.value);
  }
  function refresh() {
    if (solution && solution.display !== bar.value) solution = null;
    render();
  }
  function render() {
    get('calculator-problem').textContent = problem() || 'Enter a math expression.';
    get('calculator-answer').textContent = solution ? (solution.approximate ? '≈ ' : '') + solution.answer : 'Press Solve when ready.';
    get('speak-problem').disabled = !problem().trim();
    for (const id of ['speak-answer', 'speak-both', 'calculator-read-answer']) get(id).disabled = !solution;
  }
  const editing = () => { solution = null; render(); };
  get('speak-problem').onclick = () => { if (problem().trim()) window.speak(problem()); };
  get('speak-answer').onclick = get('calculator-read-answer').onclick = () => { if (solution) window.speak((solution.approximate ? 'approximately ' : '') + solution.answer); };
  get('speak-both').onclick = () => { if (solution) window.speak(solution.problem + (solution.approximate ? ' approximately equals ' : ' equals ') + solution.answer); };
  get('calculator-stop').onclick = () => window.stopSpeaking();
  get('calculator-more').onclick = () => {
    const panel = get('calculator-more-panel');
    panel.hidden = !panel.hidden;
    get('calculator-more').setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) { panel.scrollIntoView?.({ block: 'nearest' }); panel.focus(); }
  };
  function renderPhrases() {
    get('calculator-phrases').replaceChildren();
    get('calculator-phrase-choice').replaceChildren();
    phrases.forEach((phrase, index) => {
      const button = document.createElement('button'); button.className = 'button small';
      button.textContent = phrase;
      button.onclick = () => window.speak(phrases[index]);
      get('calculator-phrases').append(button);
      get('calculator-phrase-choice').add(new Option('Phrase ' + (index + 1), String(index)));
    });
    get('calculator-phrase-choice').value = '0';
    get('calculator-phrase-text').value = phrases[0];
  }
  get('calculator-phrase-choice').onchange = () => { get('calculator-phrase-text').value = phrases[Number(get('calculator-phrase-choice').value)]; };
  get('calculator-save-phrase').onclick = () => {
    const text = get('calculator-phrase-text').value.trim();
    if (!text) { setStatus('Enter a phrase before saving.'); get('calculator-phrase-text').focus(); return; }
    const index = Number(get('calculator-phrase-choice').value);
    phrases[index] = text.slice(0, 160); renderPhrases();
    get('calculator-phrase-choice').value = String(index); get('calculator-phrase-text').value = phrases[index];
    setStatus('Math phrase saved. Your equation is unchanged.'); save();
  };
  get('calculator-template').onchange = () => {
    const fraction = get('calculator-template').value === 'fraction';
    get('template-first-label').textContent = fraction ? 'Numerator (top)' : 'Base';
    get('template-second-label').textContent = fraction ? 'Denominator (bottom)' : 'Exponent (power)';
  };
  get('calculator-insert-template').onclick = () => {
    for (const id of ['template-first', 'template-second']) {
      if (!get(id).value.trim()) {
        const label = get(id === 'template-first' ? 'template-first-label' : 'template-second-label').textContent;
        setStatus('Enter ' + label.toLowerCase() + ' before inserting.'); get(id).focus(); return;
      }
    }
    const a = get('template-first').value.trim(), b = get('template-second').value.trim();
    window.sharedMath.edit(`((${a})${get('calculator-template').value === 'fraction' ? '/' : '^'}(${b}))`);
  };
  for (const id of ['template-first', 'template-second']) get(id).addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); get('calculator-insert-template').click(); }
  });
  let guided = false;
  function guideNext() {
    const parts = ['expression', 'variable', ...(get('integral-bounds').hidden ? [] : ['lower', 'upper'])];
    const current = window.sharedMath.target()?.id.replace('integral-', '');
    const index = parts.indexOf(current);
    if (index === parts.length - 1) { window.sharedMath.solve(); return; }
    get('integral-edit-' + parts[index + 1]).click();
  }
  get('calculator-integral-guide').onclick = () => {
    selectTab('math'); selectSubtab(document.querySelector('[data-subtab="calculus"]'));
    guided = true; get('integral-guide-next').hidden = false;
    get('integral-edit-expression').click();
    setStatus('Start with the expression. Next step moves to the variable, then the bounds. You can edit any slot directly.');
  };
  get('integral-guide-next').onclick = guideNext;
  window.calculatorAccess = {
    editing, refresh, subjectChanged: applyPreferences,
    snapshot: () => solution,
    restore(value) { solution = value || null; render(); },
    solved(problem, answer, approximate = false) { solution = { problem, answer, approximate, display: bar.value }; render(); },
    friendlyError(error) {
      const message = error.message;
      if (message === 'Expected ")".') return 'Add a closing parenthesis ) to finish this expression.';
      if (message === 'Expected a number, variable, or function.') return 'Add a number or expression after the last operator, then press Solve.';
      return message;
    },
    updateGuide() {
      if (!guided) return;
      const part = window.sharedMath.target()?.id;
      get('integral-guide-next').textContent = part === (get('integral-bounds').hidden ? 'integral-variable' : 'integral-upper') ? 'Solve integral' : 'Next step';
    }
  };
  renderPhrases(); applyPreferences(); render();
})();

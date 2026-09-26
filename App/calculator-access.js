/* Quiet previews, explicit answer speech, and expression templates. */
(function () {
  'use strict';
  const get = id => document.getElementById(id), bar = get('display');
  const preferenceIds = ['calculator-still', 'calculator-preview'];
  let preferences = {}, solution = null, templateDestination = null;
  try { preferences = JSON.parse(localStorage.getItem('math-aac-calculator-access-v1') || '{}').preferences || {}; } catch (_) {}
  if (!preferences || typeof preferences !== 'object' || Array.isArray(preferences)) preferences = {};
  function applyPreferences() {
    for (const id of preferenceIds) preferences[id] = get(id).checked;
    document.body.classList.toggle('still-keys', preferences['calculator-still']);
    get('calculator-result').setAttribute('aria-live', 'off');
  }
  for (const id of preferenceIds) {
    get(id).checked = typeof preferences[id] === 'boolean' ? preferences[id] : true;
    get(id).onchange = () => {
      applyPreferences();
      try { localStorage.setItem('math-aac-calculator-access-v1', JSON.stringify({ preferences })); } catch (_) {}
      window.scheduleCalculatorPreview();
    };
  }
  function render() {
    get('speak-answer').disabled = !solution;
    if (solution) get('calculator-result').textContent = solution.problem + (solution.approximate ? ' ≈ ' : ' = ') + solution.answer;
  }
  const editing = () => { solution = null; render(); };
  get('speak-answer').onclick = () => { if (solution) window.speak((solution.approximate ? 'approximately ' : '') + solution.answer); };
  get('calculator-stop').onclick = () => window.stopSpeaking();
  get('calculator-template').onchange = () => {
    const fraction = get('calculator-template').value === 'fraction';
    get('template-first-label').textContent = fraction ? 'Numerator' : 'Base';
    get('template-second-label').textContent = fraction ? 'Denominator' : 'Exponent';
  };
  get('calculator-insert-template').onclick = () => {
    for (const id of ['template-first', 'template-second']) {
      if (!get(id).value.trim()) { setStatus('Enter both values first.'); get(id).focus(); return; }
    }
    const a = get('template-first').value.trim(), b = get('template-second').value.trim();
    window.sharedMath.checkpoint();
    if (templateDestination) {
      window.sharedMath.choose(templateDestination.field);
      bar.value = templateDestination.value;
      bar.setSelectionRange(templateDestination.start, templateDestination.end);
    } else window.sharedMath.choose(null);
    window.sharedMath.edit(`((${a})${get('calculator-template').value === 'fraction' ? '/' : '^'}(${b}))`);
    templateDestination = null;
  };
  for (const id of ['template-first', 'template-second']) get(id).addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); get('calculator-insert-template').click(); }
  });
  window.calculatorAccess = {
    editing, subjectChanged: applyPreferences,
    templateEntering() {
      if (!window.sharedMath.target()?.id.startsWith('template-')) templateDestination = {
        field: window.sharedMath.target(), value: bar.value, start: bar.selectionStart, end: bar.selectionEnd
      };
    },
    refresh() { if (solution && solution.display !== bar.value) solution = null; render(); return !!solution; },
    snapshot: () => solution,
    restore(value) { solution = value || null; render(); },
    solved(problem, answer, approximate = false) { solution = { problem, answer, approximate, display: bar.value }; render(); },
    friendlyError(error) {
      if (error.message === 'Expected ")".') return 'Add a closing parenthesis ).';
      if (error.message === 'Expected a number, variable, or function.') return 'Add a number or expression after the operator.';
      return error.message;
    }
  };
  applyPreferences(); render();
})();

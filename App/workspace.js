/* One visible editing target, shared by every math board and the speech bar. */
(function () {
  'use strict';
  const get = id => document.getElementById(id), bar = get('display');
  const fields = {
    'template-first': 'Expression builder · first value', 'template-second': 'Expression builder · second value',
    'integral-expression': 'Integral · expression', 'integral-variable': 'Integral · variable',
    'integral-lower': 'Integral · lower bound', 'integral-upper': 'Integral · upper bound',
    'function-name': 'Function · name', 'function-parameters': 'Function · variables',
    'function-rule': 'Function · rule', 'function-arguments': 'Function · evaluate at',
    'series-expression': 'Series · term', 'series-variable': 'Series · index variable',
    'series-lower': 'Series · first index', 'series-upper': 'Series · last index',
    'count-n': 'Counting · total items', 'count-r': 'Counting · selected items',
    'set-a': 'Set A', 'set-b': 'Set B', 'graph-expression': 'Graph · expression',
    'graph-xmin': 'Graph · x minimum', 'graph-xmax': 'Graph · x maximum',
    'graph-ymin': 'Graph · y minimum', 'graph-ymax': 'Graph · y maximum', 'graph-at': 'Graph · evaluate at'
  };
  let target = null, publication = null;
  const undoStack = [];
  let restoring = false;
  function checkpoint() {
    if (restoring) return;
    const state = {
      values: Object.fromEntries(['display', ...Object.keys(fields)].map(id => [id, get(id).value])),
      target: target?.id, publication, start: bar.selectionStart, end: bar.selectionEnd,
      answer: window.mathCalculator.answer,
      definitions: window.mathCalculator.serialize(),
      solution: window.calculatorAccess?.snapshot()
    };
    if (JSON.stringify(state) === JSON.stringify(undoStack.at(-1))) return;
    undoStack.push(state);
    if (undoStack.length > 50) undoStack.shift();
    get('calculator-undo').disabled = !undoStack.length;
    return state;
  }
  function discardCheckpoint(state) {
    if (state && undoStack.at(-1) === state) undoStack.pop();
    get('calculator-undo').disabled = !undoStack.length;
  }
  function undo() {
    const state = undoStack.pop();
    if (!state) return;
    restoring = true;
    for (const [id, value] of Object.entries(state.values)) get(id).value = value;
    choose(state.target ? get(state.target) : null);
    for (const id of Object.keys(fields)) notify(get(id));
    bar.value = state.values.display;
    bar.setSelectionRange(state.start ?? bar.value.length, state.end ?? bar.value.length);
    publication = state.publication;
    window.mathCalculator.answer = state.answer;
    if (state.definitions !== window.mathCalculator.serialize()) window.restoreFunctions(state.definitions);
    get('shared-use-answer').hidden = publication?.answer === undefined;
    get('shared-use-answer').textContent = /\+ C$/.test(publication?.text || '') ? 'Use antiderivative (C = 0)' : 'Use answer';
    window.calculatorAccess?.restore(state.solution);
    restoring = false;
    get('calculator-undo').disabled = !undoStack.length;
    bar.focus(); window.scheduleCalculatorPreview(); setStatus('Previous math entry restored.');
  }
  const notify = field => field.dispatchEvent(new Event('input', { bubbles: true }));
  function invalidate() { publication = null; get('shared-use-answer').hidden = true; }
  function selection(from, to) { to.setSelectionRange(from.selectionStart ?? from.value.length, from.selectionEnd ?? from.value.length); }
  function choose(field) {
    const editingField = field || target;
    invalidate();
    target = field;
    if (field) { bar.value = field.value; selection(field, bar); }
    get('field-context').hidden = !field;
    for (const id of Object.keys(fields)) get(id).classList.toggle('linked-math-field', id === field?.id);
    get('editing-location').textContent = 'Editing: ' + (field ? fields[field.id] : 'TTS bar / calculator');
    bar.placeholder = field ? 'Input ' + fields[field.id].toLowerCase() : 'Input math to solve or speak';
    bar.setAttribute('aria-label', field ? 'Editing ' + fields[field.id] : 'Math and speech bar');
    get('return-to-field').hidden = !field;
    get('return-to-field').textContent = field ? 'Return to ' + fields[field.id].split(' · ')[0].toLowerCase() : 'Return to field';
    if (editingField) window.calculatorAccess?.editing();
    window.scheduleCalculatorPreview();
  }
  function changed(field = bar) {
    invalidate();
    if (field !== bar) {
      if (target !== field) choose(field);
      bar.value = field.value; selection(field, bar);
    } else if (target) {
      target.value = bar.value; selection(bar, target); notify(target);
    }
    window.calculatorAccess?.editing();
    window.scheduleCalculatorPreview();
  }
  function edit(text, record = true) {
    if (record) checkpoint();
    bar.setRangeText(text, bar.selectionStart ?? bar.value.length, bar.selectionEnd ?? bar.value.length, 'end');
    changed(); bar.focus();
  }
  function erase(clear = false) {
    checkpoint();
    const start = bar.selectionStart ?? bar.value.length, end = bar.selectionEnd ?? start;
    bar.setRangeText('', clear ? 0 : start === end ? Math.max(0, start - 1) : start, clear ? bar.value.length : end, 'end');
    changed(); bar.focus();
  }
  for (const [id, label] of Object.entries(fields)) {
    const field = get(id);
    field.addEventListener('focus', () => {
      if (id.startsWith('template-')) window.calculatorAccess?.templateEntering();
      choose(field);
    });
    field.addEventListener('click', () => { if (target !== field) choose(field); });
    field.addEventListener('beforeinput', checkpoint);
    field.addEventListener('input', () => { if (target === field) { bar.value = field.value; selection(field, bar); invalidate(); window.calculatorAccess?.editing(); window.scheduleCalculatorPreview(); } });
    for (const event of ['select', 'click', 'keyup']) field.addEventListener(event, () => { if (target === field) selection(field, bar); });
  }
  bar.addEventListener('input', () => changed());
  bar.addEventListener('beforeinput', checkpoint);
  get('calculator-undo').onclick = undo;
  get('return-to-field').onclick = () => {
    if (!target) return;
    const panel = target.id.startsWith('integral-') ? 'calculus' : target.id.startsWith('function-') ? 'functions' : target.id.startsWith('graph-') ? 'graphing' : target.id.startsWith('template-') ? 'algebra' : 'discrete';
    selectTab('math'); selectSubtab(document.querySelector('[data-subtab="' + panel + '"]'));
    const page = target.closest('.tool-page');
    if (page) showToolPage(page.id);
    target.focus();
  };
  get('finish-field').onclick = () => { choose(null); bar.focus(); };
  function solve() {
    const id = target?.id || '';
    if (!id && current() && !current().source) { setStatus('Choose a field or enter a math expression in the bar to solve.'); return; }
    if (id.startsWith('template-')) get('calculator-insert-template').click();
    else if (id.startsWith('integral-')) window.solveIntegral();
    else if (id === 'function-arguments') get('evaluate-function').click();
    else if (id.startsWith('function-')) get('save-function').click();
    else if (/^(series-|count-|set-)/.test(id)) get('discrete-calculate').click();
    else if (id.startsWith('graph-')) get(id === 'graph-at' ? 'graph-evaluate' : 'graph-plot').click();
    else window.evaluate();
  }
  get('shared-solve').onclick = solve;
  get('shared-use-answer').onclick = () => {
    const answer = current()?.answer;
    if (answer === undefined) return;
    checkpoint();
    choose(null); bar.value = answer; bar.setSelectionRange(answer.length, answer.length); bar.focus(); window.scheduleCalculatorPreview();
    window.calculatorAccess?.editing();
  };
  function current() { return publication?.text === bar.value ? publication : null; }
  window.sharedMath = {
    edit, erase, changed, solve, choose, current, checkpoint, discardCheckpoint, undo,
    target: () => target,
    publish(text, source, answer) {
      choose(null); bar.value = text; bar.setSelectionRange(text.length, text.length);
      publication = { text, source, answer };
      get('shared-use-answer').hidden = answer === undefined;
      get('shared-use-answer').textContent = /\+ C$/.test(text) ? 'Use antiderivative (C = 0)' : 'Use answer';
      window.scheduleCalculatorPreview();
    }
  };
  document.querySelectorAll('[data-result-to-bar]').forEach(button => {
    const result = get(button.dataset.resultToBar);
    button.onclick = () => {
      if (result.dataset.valid !== 'true') { setStatus('Calculate a valid result before sending it to the bar.'); return; }
      checkpoint(); window.sharedMath.publish(result.textContent); window.calculatorAccess?.editing();
    };
    get('discrete').querySelectorAll('input, select').forEach(field => {
      for (const event of ['input', 'change']) field.addEventListener(event, () => { result.dataset.valid = 'false'; });
    });
  });
  choose(null);
})();

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
    window.sharedMath.edit(`((${a})${get('calculator-template').value === 'fraction' ? '/' : '^'}(${b}))`, false);
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

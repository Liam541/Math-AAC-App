/* One visible editing target, shared by every math board and the speech bar. */
(function () {
  'use strict';
  const get = id => document.getElementById(id), bar = get('display');
  const selector = get('math-input-target');
  const fields = {
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
    if (field || target) invalidate();
    target = field;
    selector.value = field?.id || '';
    if (field) { bar.value = field.value; selection(field, bar); }
    get('shared-input-help').textContent = field
      ? fields[field.id] + ' is linked to the TTS bar. Symbols from every math tab edit this field.'
      : 'Choose a field to edit it through the TTS bar. Keep using symbols from any math tab.';
    document.querySelectorAll('.keypad-target, #function-keypad-target').forEach(label => {
      label.textContent = 'Keypad edits: ' + (field ? fields[field.id] : 'TTS bar');
    });
    for (const id of Object.keys(fields)) get(id).classList.toggle('linked-math-field', id === field?.id);
    get('editing-location').textContent = 'Editing: ' + (field ? fields[field.id] : 'TTS bar / calculator');
    get('return-to-field').hidden = !field;
    get('return-to-field').textContent = field ? 'Return to ' + fields[field.id].split(' · ')[0].toLowerCase() : 'Return to field';
    if (editingField) window.calculatorAccess?.editing();
    window.calculatorAccess?.updateGuide();
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
  function edit(text) {
    checkpoint();
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
    selector.add(new Option(label, id));
    get('shared-use-display').add(new Option(label, id));
    field.addEventListener('focus', () => choose(field));
    field.addEventListener('beforeinput', checkpoint);
    field.addEventListener('input', () => { if (target === field) { bar.value = field.value; selection(field, bar); invalidate(); window.calculatorAccess?.editing(); window.scheduleCalculatorPreview(); } });
    for (const event of ['select', 'click', 'keyup']) field.addEventListener(event, () => { if (target === field) selection(field, bar); });
  }
  bar.addEventListener('input', () => changed());
  bar.addEventListener('beforeinput', checkpoint);
  get('calculator-undo').onclick = undo;
  get('return-to-field').onclick = () => {
    if (!target) return;
    const panel = target.id.startsWith('integral-') ? 'calculus' : target.id.startsWith('function-') ? 'functions' : target.id.startsWith('graph-') ? 'graphing' : 'greek';
    selectTab('math'); selectSubtab(document.querySelector('[data-subtab="' + panel + '"]'));
    target.focus();
  };
  selector.onchange = () => { choose(get(selector.value)); bar.focus(); };
  get('shared-use-display').onchange = () => {
    const field = get(get('shared-use-display').value);
    if (!field) return;
    checkpoint();
    field.value = bar.value; choose(field); notify(field);
    get('shared-use-display').value = '';
    setStatus('TTS bar copied to ' + fields[field.id] + '.'); bar.focus();
  };
  function solve() {
    const id = target?.id || '';
    if (!id && current() && !current().source) { setStatus('Choose a field or enter a math expression in the bar to solve.'); return; }
    if (id.startsWith('integral-')) window.solveIntegral();
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
    button.onclick = () => { checkpoint(); window.sharedMath.publish(get(button.dataset.resultToBar).textContent); window.calculatorAccess?.editing(); };
  });
  choose(null);
})();

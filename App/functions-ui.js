/* Use the existing display, result history, status area, and calculator buttons. */
(function () {
  'use strict';
  const calculator = new AACFunctions.Calculator();
  window.mathCalculator = calculator;
  const input = document.querySelector('#display');
  const statusArea = document.querySelector('#status');
  const storageKey = 'math-aac-functions-v1';
  const get = id => document.querySelector('#' + id);
  const rule = get('function-rule');
  const argumentsInput = get('function-arguments');
  const resultArea = get('function-result');
  let keypadInput = rule;
  function report(message) {
    statusArea.textContent = message;
    resultArea.textContent = message;
  }
  function renderFunctions(selectedName) {
    for (const id of ['saved-function', 'compose-function', 'calculator-function']) {
      const select = get(id);
      const previous = id === 'compose-function' ? select.value : selectedName || select.value;
      select.replaceChildren();
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = calculator.definitions.size ? 'Choose a function' : 'No saved functions yet';
      select.append(empty);
      for (const definition of calculator.definitions.values()) {
        const option = document.createElement('option');
        option.value = definition.name;
        option.textContent = definition.source;
        select.append(option);
      }
      select.value = calculator.definitions.has(previous) ? previous : '';
    }
  }
  function openMath(panel) {
    selectTab('math');
    selectSubtab(document.querySelector('[data-subtab="' + panel + '"]'));
  }
  function insertAt(field, text, insideParentheses = false) {
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? start;
    field.setRangeText(text, start, end, 'end');
    if (insideParentheses) field.setSelectionRange(start + text.length - 1, start + text.length - 1);
    field.focus();
  }
  function selected(id = 'saved-function') {
    const definition = calculator.definitions.get(get(id).value);
    if (!definition) { report('Choose a saved function first.'); return null; }
    return definition;
  }
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) calculator.restore(saved);
  } catch (_) {
    statusArea.textContent = 'Saved functions could not be loaded. You can define functions for this session.';
  }
  renderFunctions();
  window.evaluate = function () {
    try {
      const result = calculator.evaluate(input.value);
      if (result.kind === 'definition') {
        const definition = result.definition;
        let saved = true;
        try { localStorage.setItem(storageKey, calculator.serialize()); } catch (_) { saved = false; }
        renderFunctions(definition.name);
        report((saved ? 'Saved ' : 'Defined for this session: ') + definition.source
          + '. Enter a value below or use it in the calculator.');
      } else {
        const formatted = String(Number(result.value.toPrecision(12)));
        input.value = formatted;
        input.dataset.lastResult = String(result.value);
        lastResult = formatted;
        report('Result: ' + formatted);
      }
    } catch (error) {
      report('Could not evaluate: ' + error.message);
    }
  };
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); window.evaluate(); }
  });
  document.querySelector('#show-functions').addEventListener('click', () => {
    const definitions = [...calculator.definitions.values()];
    report(definitions.length
      ? 'Saved functions: ' + definitions.map(d => d.source).join('; ') + '. To change one, enter its new definition.'
      : 'No saved functions. Enter a rule above and press Save function.');
  });
  for (const [field, label] of [[rule, 'Rule'], [argumentsInput, 'Evaluate at'], [input, 'Display']]) {
    field.addEventListener('focus', () => {
      keypadInput = field;
      get('function-keypad-target').textContent = 'Keypad edits: ' + label;
    });
  }
  // Common-function buttons already call append(); route them to the chosen field only here.
  window.insertFunctionValue = value => {
    if (!get('math').classList.contains('active')) return false;
    if (get('basic').classList.contains('active')) insertAt(input, value);
    else if (get('functions').classList.contains('active')) insertAt(keypadInput, value);
    else return false;
    return true;
  };
  window.backspaceMath = () => {
    if (!get('math').classList.contains('active') || !get('basic').classList.contains('active')) return false;
    const end = input.selectionEnd ?? input.value.length;
    const start = input.selectionStart ?? end;
    input.setRangeText('', start === end ? Math.max(0, start - 1) : start, end, 'end');
    input.focus();
    return true;
  };
  get('save-function').addEventListener('click', () => {
    input.value = `${get('function-name').value.trim()}(${get('function-parameters').value.trim()})=${rule.value.trim()}`;
    window.evaluate();
  });
  rule.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); get('save-function').click(); }
  });
  get('edit-function').addEventListener('click', () => {
    const definition = selected();
    if (!definition) return;
    get('function-name').value = definition.name;
    get('function-parameters').value = definition.parameters.join(',');
    rule.value = definition.body;
    rule.focus();
    report('Editing ' + definition.source + '. Press Save function to apply changes.');
  });
  function useInCalculator(id) {
    const definition = selected(id);
    if (!definition) return;
    openMath('basic');
    // A completed definition/result is replaced; unfinished arithmetic keeps its insertion point.
    if (input.value.includes('=') || input.value === lastResult) input.value = '';
    insertAt(input, definition.name + '()', true);
    report('Enter ' + definition.parameters.join(', ') + ' inside the parentheses, then press ENTER.');
  }
  get('use-function').addEventListener('click', () => useInCalculator('saved-function'));
  get('calculator-insert-function').addEventListener('click', () => useInCalculator('calculator-function'));
  get('insert-function').addEventListener('click', () => {
    const definition = selected();
    if (definition) insertAt(keypadInput, definition.name + '()', true);
  });
  function evaluateSelected(compose) {
    const outer = selected();
    const inner = compose ? selected('compose-function') : null;
    if (!outer || (compose && !inner)) return;
    if (!argumentsInput.value.trim()) { report('Enter a value in Evaluate at first.'); argumentsInput.focus(); return; }
    const expression = compose
      ? `${outer.name}(${inner.name}(${argumentsInput.value}))`
      : `${outer.name}(${argumentsInput.value})`;
    input.value = expression;
    window.evaluate();
    if (!statusArea.textContent.startsWith('Could not evaluate:')) report(expression + ' = ' + input.value);
  }
  get('evaluate-function').addEventListener('click', () => evaluateSelected(false));
  get('evaluate-composition').addEventListener('click', () => evaluateSelected(true));
  argumentsInput.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); evaluateSelected(false); }
  });
  document.querySelectorAll('[data-open-math]').forEach(button => button.addEventListener('click', () => openMath(button.dataset.openMath)));
  document.querySelectorAll('[data-function-template]').forEach(button => button.addEventListener('click', () => {
    get('function-name').value = button.dataset.functionTemplate;
    get('function-parameters').value = 'x';
    rule.value = calculator.definitions.get(button.dataset.functionTemplate)?.body || '';
    rule.focus();
  }));
  const keys = ['7', '8', '9', '+', '(', ')', '4', '5', '6', '-', 'x', '^', '1', '2', '3', '*', 'y', ',', '0', '.', '/', 'Backspace', 'Clear', 'Variables'];
  keys.forEach(value => {
    const button = document.createElement('button');
    button.className = 'key' + (['Backspace', 'Clear', 'Variables'].includes(value) ? ' secondary' : '');
    button.textContent = value;
    button.addEventListener('click', () => {
      if (value === 'Clear') { keypadInput.value = ''; keypadInput.focus(); }
      else if (value === 'Backspace') {
        const end = keypadInput.selectionEnd ?? keypadInput.value.length;
        const start = keypadInput.selectionStart ?? end;
        keypadInput.setRangeText('', start === end ? Math.max(0, start - 1) : start, end, 'end');
        keypadInput.focus();
      } else if (value === 'Variables') {
        insertAt(keypadInput, get('function-parameters').value);
      } else insertAt(keypadInput, value);
    });
    get('function-keypad').append(button);
  });
  statusArea.setAttribute('role', 'status');
  statusArea.setAttribute('aria-live', 'polite');
})();

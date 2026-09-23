(function () {
  'use strict';
  const get = id => document.getElementById(id);
  const calculator = window.mathCalculator, math = window.AACMathTools;
  const value = id => get(id).value.trim();
  const numeric = id => calculator.compile(value(id))();
  const formatted = n => String(Number(n.toPrecision(12)));
  function report(id, text) { get(id).textContent = text; setStatus(text); }
  function run(id, action) {
    try { report(id, action()); } catch (error) { report(id, 'Could not calculate: ' + error.message); }
  }
  function insert(field, text) {
    field.setRangeText(text, field.selectionStart ?? field.value.length, field.selectionEnd ?? field.value.length, 'end');
    field.focus();
  }
  let definite = true;
  const integralFields = ['lower', 'upper', 'expression', 'variable'];
  function focusIntegralField(part) {
    const field = get('integral-' + part);
    field.focus();
    field.select();
  }
  for (const part of integralFields) {
    get('integral-edit-' + part).onclick = () => focusIntegralField(part);
    get('integral-' + part).addEventListener('focus', () => {
      for (const item of integralFields) get('integral-edit-' + item).setAttribute('aria-pressed', String(item === part));
    });
  }
  get('integral-lower').addEventListener('keydown', event => {
    if (event.key === 'ArrowUp') { event.preventDefault(); focusIntegralField('upper'); }
  });
  get('integral-upper').addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); focusIntegralField('lower'); }
  });
  function setIntegralMode(isDefinite) {
    definite = isDefinite;
    get('integral-bounds').hidden = !definite;
    get('integral-edit-lower').hidden = !definite;
    get('integral-edit-upper').hidden = !definite;
    get('integral-entry-help').textContent = definite
      ? 'Tap a slot to edit it, or press Tab to move from the lower bound to the upper bound, expression, and variable.'
      : 'Enter the expression and variable. Switch to Definite to add upper and lower bounds.';
    for (const [id, selected] of [['integral-definite', definite], ['integral-indefinite', !definite]]) {
      get(id).setAttribute('aria-pressed', String(selected)); get(id).classList.toggle('blue', selected);
    }
    get('integral-calculate').textContent = definite ? 'Calculate definite integral' : 'Find antiderivative';
    get('integral-help').textContent = definite
      ? 'Numerical approximation for continuous functions over finite bounds. Bounds accept expressions such as pi. Do not use intervals crossing a singularity.'
      : 'Find an antiderivative + C. Supports powers, sums, constant multiples, sin, cos, exp, and reciprocals of linear expressions.';
    get('integral-result').textContent = 'Ready to calculate ' + (definite ? 'a definite integral.' : 'an antiderivative.');
    focusIntegralField(definite ? 'lower' : 'expression');
  }
  get('integral-indefinite').onclick = () => setIntegralMode(false);
  get('integral-definite').onclick = () => setIntegralMode(true);
  get('integral-calculate').onclick = () => run('integral-result', () => {
    const required = definite ? integralFields : ['expression', 'variable'];
    for (const part of required) {
      if (!value('integral-' + part)) {
        focusIntegralField(part);
        throw Error('Enter ' + ({ lower: 'a lower bound', upper: 'an upper bound', expression: 'an expression', variable: 'a variable' })[part] + ' in the highlighted slot.');
      }
    }
    const expression = value('integral-expression'), v = value('integral-variable');
    return definite
      ? `∫ from ${value('integral-lower')} to ${value('integral-upper')} of (${expression}) d${v} ≈ ${formatted(math.definite(calculator, expression, v, numeric('integral-lower'), numeric('integral-upper')))}`
      : `∫ (${expression}) d${v} = ${math.indefinite(calculator, expression, v)}`;
  });
  let greekVariable = 'θ';
  for (const [letter, name] of Object.entries(AACFunctions.greek)) {
    const button = document.createElement('button'); button.className = 'button';
    button.textContent = letter + ' · ' + name; button.setAttribute('aria-label', name);
    button.onclick = () => {
      greekVariable = letter;
      get('greek-function').textContent = 'Define with ' + letter;
      insert(get('display'), letter);
    };
    get('greek-letters').append(button);
  }
  get('greek-define').onclick = () => window.evaluate();
  get('greek-function').onclick = () => {
    get('function-parameters').value = greekVariable;
    selectTab('math'); selectSubtab(document.querySelector('[data-subtab="functions"]'));
    get('function-rule').focus();
    setStatus('Write a rule using ' + greekVariable + ', then save the function.');
  };
  function discreteMode() {
    const op = value('discrete-operation');
    const groups = { series: ['sum', 'product'], counting: ['choose', 'permute'], sets: ['union', 'intersection', 'difference'], logic: ['and', 'or', 'implies'] };
    for (const [group, ops] of Object.entries(groups)) get('discrete-' + group).hidden = !ops.includes(op);
    get('discrete-result').textContent = 'Enter values for ' + get('discrete-operation').selectedOptions[0].textContent + '.';
  }
  get('discrete-operation').onchange = discreteMode;
  get('discrete-calculate').onclick = () => run('discrete-result', () => {
    const op = value('discrete-operation');
    if (['sum', 'product'].includes(op)) return `${op === 'sum' ? 'Σ' : 'Π'} (${value('series-expression')}), ${value('series-variable')} = ${value('series-lower')} to ${value('series-upper')}: ${formatted(math.series(calculator, value('series-expression'), value('series-variable'), numeric('series-lower'), numeric('series-upper'), op === 'product'))}`;
    if (['choose', 'permute'].includes(op)) {
      const result = math.counting(numeric('count-n'), numeric('count-r'), op === 'permute');
      return `${value('count-n')} ${op === 'choose' ? 'choose' : 'permute'} ${value('count-r')} = ${formatted(result)}${Number.isSafeInteger(result) ? '' : ' (approximate)'}`;
    }
    if (['union', 'intersection', 'difference'].includes(op)) {
      const elements = id => new Set(value(id).split(',').map(s => s.trim()).filter(Boolean));
      const a = elements('set-a'), b = elements('set-b');
      const result = op === 'union' ? [...new Set([...a, ...b])] : [...a].filter(x => op === 'intersection' ? b.has(x) : !b.has(x));
      return `A ${op === 'union' ? '∪' : op === 'intersection' ? '∩' : '∖'} B = {${result.join(', ')}}`;
    }
    const p = value('logic-p') === 'true', q = value('logic-q') === 'true';
    const result = op === 'and' ? p && q : op === 'or' ? p || q : !p || q;
    return `${p} ${op === 'and' ? '∧' : op === 'or' ? '∨' : '→'} ${q} = ${result}`;
  });
  document.querySelectorAll('[data-tool-display]').forEach(button => button.onclick = () => {
    get(button.dataset.toolDisplay).value = get('display').value; get(button.dataset.toolDisplay).focus();
  });
  document.querySelectorAll('[data-speak-result]').forEach(button => button.onclick = () => window.speak(get(button.dataset.speakResult).textContent));

  function refreshFunctions() {
    const select = get('graph-function'), previous = select.value;
    select.replaceChildren(new Option('Choose a function', ''));
    for (const definition of calculator.definitions.values()) {
      if (definition.parameters.length === 1) select.add(new Option(definition.source, definition.name));
    }
    select.value = previous;
  }
  get('graph-function').onchange = () => {
    if (value('graph-function')) { get('graph-expression').value = value('graph-function') + '(x)'; plot(); }
  };
  const svg = get('graph-canvas');
  function draw(tag, attrs, text, parent = svg) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    parent.append(node); return node;
  }
  function plot() {
    svg.replaceChildren();
    svg.setAttribute('aria-label', 'Function graph');
    run('graph-result', () => {
      const xmin = numeric('graph-xmin'), xmax = numeric('graph-xmax'), ymin = numeric('graph-ymin'), ymax = numeric('graph-ymax');
      if (!(xmin < xmax && ymin < ymax) || !Number.isFinite(xmax - xmin) || !Number.isFinite(ymax - ymin)) throw Error('Each minimum must be less than its maximum, with a finite range.');
      const expression = value('graph-expression').replace(/^y\s*=\s*/, '');
      const f = calculator.compile(expression, ['x']);
      const X = x => 72 + (x - xmin) / (xmax - xmin) * 620, Y = y => 400 - (y - ymin) / (ymax - ymin) * 370;
      draw('title', {}, 'Graph of y = ' + expression);
      draw('desc', {}, `x from ${xmin} to ${xmax}; y from ${ymin} to ${ymax}. Use Find y at this x for numeric values.`);
      draw('rect', { x: 72, y: 30, width: 620, height: 370, class: 'graph-frame' });
      for (let i = 0; i <= 5; i++) {
        const x = xmin + (xmax - xmin) * i / 5, y = ymin + (ymax - ymin) * i / 5;
        draw('line', { x1: X(x), x2: X(x), y1: 30, y2: 400, class: 'graph-grid' });
        draw('line', { x1: 72, x2: 692, y1: Y(y), y2: Y(y), class: 'graph-grid' });
        draw('text', { x: X(x), y: 423, 'text-anchor': 'middle' }, Number(x.toPrecision(4)));
        draw('text', { x: 64, y: Y(y) + 5, 'text-anchor': 'end' }, Number(y.toPrecision(4)));
      }
      if (xmin <= 0 && xmax >= 0) draw('line', { x1: X(0), x2: X(0), y1: 30, y2: 400, class: 'graph-axis' });
      if (ymin <= 0 && ymax >= 0) draw('line', { x1: 72, x2: 692, y1: Y(0), y2: Y(0), class: 'graph-axis' });
      draw('text', { x: 382, y: 450 }, 'x'); draw('text', { x: 18, y: 22 }, 'y');
      let path = '', previous = null, valid = 0, visible = 0, firstError;
      for (let i = 0; i <= 1240; i++) {
        const x = xmin + (xmax - xmin) * i / 1240;
        let y;
        try { y = f({ x }); } catch (error) { firstError ||= error; previous = null; continue; }
        valid++;
        if (y < ymin || y > ymax) { previous = null; continue; }
        visible++;
        // Never join across a domain gap or a jump larger than half the viewport.
        const join = previous !== null && Math.abs(y - previous) < (ymax - ymin) / 2;
        path += `${join ? 'L' : 'M'}${X(x).toFixed(2)},${Y(y).toFixed(2)} `;
        previous = y;
      }
      if (!valid) throw firstError || Error('No real values in this x range.');
      draw('path', { d: path, class: 'graph-curve', fill: 'none' });
      svg.setAttribute('aria-label', `Graph of y = ${expression}, x from ${xmin} to ${xmax}, y from ${ymin} to ${ymax}`);
      return visible ? `y = ${expression}. Plotted over ${formatted(xmin)} ≤ x ≤ ${formatted(xmax)}. Gaps may indicate undefined values or values outside the window.` : 'No curve is visible in this y window. Adjust the y bounds.';
    });
  }
  get('graph-plot').onclick = plot;
  get('graph-reset').onclick = () => { for (const axis of ['x', 'y']) { get('graph-' + axis + 'min').value = '-10'; get('graph-' + axis + 'max').value = '10'; } plot(); };
  get('graph-use-display').onclick = () => {
    const source = get('display').value.trim();
    const definition = /^([A-Za-z][A-Za-z0-9_]*)\s*\([^)]*\)\s*=/.exec(source);
    get('graph-expression').value = definition && calculator.definitions.has(definition[1]) ? definition[1] + '(x)' : source.replace(/^y\s*=\s*/, '');
    plot();
  };
  get('graph-evaluate').onclick = () => run('graph-result', () => {
    const x = numeric('graph-at');
    const y = calculator.compile(value('graph-expression').replace(/^y\s*=\s*/, ''), ['x'])({ x });
    return `At x = ${formatted(x)}, y = ${formatted(y)}.`;
  });
  window.openGraphing = () => {
    selectTab('math'); selectSubtab(document.querySelector('[data-subtab="graphing"]'));
    refreshFunctions(); plot();
  };
  document.querySelector('[data-subtab="graphing"]').addEventListener('click', () => { refreshFunctions(); plot(); });

  // Keep the familiar keys available for touch entry into each tool's selected field.
  for (const [panel, initial, action] of [['calculus', 'integral-expression', 'integral-calculate'], ['greek', 'series-expression', 'discrete-calculate'], ['graphing', 'graph-expression', 'graph-plot']]) {
    let target = get(initial);
    const help = document.createElement('p'); help.className = 'muted';
    const label = () => { help.textContent = 'Keypad edits: ' + (document.querySelector(`label[for="${target.id}"]`)?.textContent || 'Display'); };
    label();
    get(panel).querySelectorAll('input').forEach(field => {
      field.addEventListener('focus', () => { target = field; label(); });
      field.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); get(action).click(); } });
    });
    const grid = document.createElement('div'); grid.className = 'key-grid ti83-grid';
    for (const key of ['7', '8', '9', '+', '(', ')', '4', '5', '6', '-', 'x', '^', '1', '2', '3', '*', 'k', '/', '0', '.', 'pi', 'sin(', 'cos(', 'exp(', 'DEL', 'CLEAR']) {
      const button = document.createElement('button'); button.className = 'key' + (['DEL', 'CLEAR'].includes(key) ? ' secondary' : ''); button.textContent = key;
      button.onclick = () => {
        if (target.closest('[hidden]')) {
          target = [...get(panel).querySelectorAll('input')].find(field => !field.closest('[hidden]')) || get('display');
          label();
        }
        if (key === 'CLEAR') target.value = '';
        else if (key === 'DEL') { const start = target.selectionStart, end = target.selectionEnd; target.setRangeText('', start === end ? Math.max(0, start - 1) : start, end, 'end'); }
        else insert(target, key);
        target.focus();
      };
      grid.append(button);
    }
    get(panel).append(help, grid);
  }
  refreshFunctions();
})();

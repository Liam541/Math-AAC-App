/* Offline calculus and discrete operations, using the calculator's safe parser. */
(function (root) {
  'use strict';
  const api = typeof module !== 'undefined' && module.exports ? require('./functions.js') : root.AACFunctions;
  const num = value => ({ type: 'number', value });
  const variable = name => ({ type: 'variable', name });
  const call = (name, arg) => ({ type: 'call', name, args: [arg] });
  function binary(op, left, right) {
    if (left.type === 'number' && right.type === 'number') {
      const a = left.value, b = right.value;
      const value = ({ '+': () => a + b, '-': () => a - b, '*': () => a * b, '/': () => a / b, '^': () => a ** b })[op]?.();
      if (Number.isFinite(value)) return num(value);
    }
    if (op === '*' && (left.value === 0 || right.value === 0)) return num(0);
    if (op === '*' && left.value === 1) return right;
    if ((op === '*' || op === '/' || op === '^') && right.value === 1) return left;
    if ((op === '+' || op === '-') && right.value === 0) return left;
    if (op === '+' && left.value === 0) return right;
    return { type: 'binary', op, left, right };
  }
  function name(source) {
    const value = api.normalize(source);
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(value) || api.reserved(value)) throw Error('Choose a variable such as x, t, or θ.');
    return value;
  }
  function expand(calculator, node, scope = {}, depth = 0, budget = { left: 4000 }) {
    if (--budget.left < 0 || depth > 50) throw Error('This expression is too complex for symbolic integration.');
    const next = n => expand(calculator, n, scope, depth + 1, budget);
    if (node.type === 'variable') return Object.hasOwn(scope, node.name) ? scope[node.name] : node.name === 'Ans' ? num(calculator.answer) : node;
    if (node.type === 'negate') return binary('*', num(-1), next(node.value));
    if (node.type === 'binary') return binary(node.op, next(node.left), next(node.right));
    if (node.type !== 'call') return node;
    const args = node.args.map(next), definition = calculator.definitions.get(node.name);
    if (!definition) return { ...node, args };
    if (args.length !== definition.parameters.length) throw Error(node.name + ' has the wrong number of arguments.');
    return expand(calculator, definition.tree, Object.fromEntries(definition.parameters.map((p, i) => [p, args[i]])), depth + 1, budget);
  }
  function depends(node, v) {
    if (node.type === 'variable') return node.name === v;
    if (node.type === 'binary') return depends(node.left, v) || depends(node.right, v);
    if (node.type === 'call') return node.args.some(n => depends(n, v));
    return false;
  }
  function format(node) {
    if (node.type === 'number') return String(node.value);
    if (node.type === 'variable') return node.name;
    if (node.type === 'call') return `${node.name}(${node.args.map(format).join(',')})`;
    return `(${format(node.left)}${node.op}${format(node.right)})`;
  }
  function indefinite(calculator, source, variableName) {
    const v = name(variableName), tree = expand(calculator, api.parse(source, [v]));
    // Validate unknown symbols and call arities without evaluating at a possibly singular point.
    const check = node => {
      if (node.type === 'variable' && ![v, 'pi', 'e'].includes(node.name)) throw Error('Unknown variable "' + node.name + '".');
      if (node.type === 'binary') { check(node.left); check(node.right); }
      if (node.type === 'call') { if (node.args.length !== 1 || !api.reserved(node.name)) throw Error('Unknown function or incorrect arguments.'); node.args.forEach(check); }
    };
    check(tree);
    const constant = n => calculator.compileTree(n)();
    function slope(n) {
      if (!depends(n, v)) return 0;
      if (n.type === 'variable') return 1;
      if (n.type === 'binary') {
        if (n.op === '+') return slope(n.left) + slope(n.right);
        if (n.op === '-') return slope(n.left) - slope(n.right);
        if (n.op === '*' && !depends(n.left, v)) return constant(n.left) * slope(n.right);
        if (n.op === '*' && !depends(n.right, v)) return constant(n.right) * slope(n.left);
        if (n.op === '/' && !depends(n.right, v)) return slope(n.left) / constant(n.right);
      }
      throw Error('nonlinear');
    }
    const unsupported = () => { throw Error('No symbolic rule for this expression. Try powers, sums, sin, cos, exp, or 1/x; use definite mode for other continuous functions.'); };
    function power(u, exponent) {
      let a; try { a = slope(u); } catch (_) { return unsupported(); }
      if (!Number.isFinite(a) || a === 0) return unsupported();
      return exponent === -1 ? binary('/', call('ln', call('abs', u)), num(a))
        : binary('/', binary('^', u, num(exponent + 1)), num(a * (exponent + 1)));
    }
    function integrate(n) {
      if (!depends(n, v)) { constant(n); return binary('*', n, variable(v)); }
      if (n.type === 'variable') return power(n, 1);
      if (n.type === 'binary') {
        const { op, left, right } = n;
        if (op === '+' || op === '-') return binary(op, integrate(left), integrate(right));
        if (op === '*' && !depends(left, v)) return binary('*', left, integrate(right));
        if (op === '*' && !depends(right, v)) return binary('*', right, integrate(left));
        if (op === '/' && !depends(right, v)) { constant(n.right); if (constant(right) === 0) throw Error('Division by zero.'); return binary('/', integrate(left), right); }
        if (op === '/' && !depends(left, v)) return binary('*', left, power(right, -1));
        if (op === '^' && !depends(right, v)) return power(left, constant(right));
      }
      if (n.type === 'call') {
        const u = n.args[0];
        if (n.name === 'sqrt') return power(u, .5);
        let a; try { a = slope(u); } catch (_) { return unsupported(); }
        if (!a || !Number.isFinite(a)) return unsupported();
        if (n.name === 'sin') return binary('/', binary('*', num(-1), call('cos', u)), num(a));
        if (n.name === 'cos') return binary('/', call('sin', u), num(a));
        if (n.name === 'exp') return binary('/', n, num(a));
      }
      return unsupported();
    }
    return format(integrate(tree)) + ' + C';
  }
  function definite(calculator, source, variableName, lower, upper) {
    const v = name(variableName), f = calculator.compile(source, [v]);
    if (!Number.isFinite(lower) || !Number.isFinite(upper)) throw Error('Use finite bounds. Improper integrals are not supported.');
    let evaluations = 0;
    const at = x => { if (++evaluations > 20000) throw Error('Integral did not converge. Check the interval for discontinuities.'); return f({ [v]: x }); };
    if (lower === upper) { at(lower); return 0; }
    const sign = lower < upper ? 1 : -1, a = Math.min(lower, upper), b = Math.max(lower, upper);
    const simpson = (l, r, fl, fm, fr) => (r - l) / 6 * (fl + 4 * fm + fr);
    function refine(l, r, fl, fm, fr, whole, tolerance, depth) {
      const m = (l + r) / 2, f1 = at((l + m) / 2), f2 = at((m + r) / 2);
      const left = simpson(l, m, fl, f1, fm), right = simpson(m, r, fm, f2, fr), delta = left + right - whole;
      if (Math.abs(delta) <= 15 * tolerance) return left + right + delta / 15;
      if (!depth) throw Error('Integral did not converge. Split the interval and check for discontinuities.');
      return refine(l, m, fl, f1, fm, left, tolerance / 2, depth - 1) + refine(m, r, fm, f2, fr, right, tolerance / 2, depth - 1);
    }
    // Seed multiple intervals to reduce aliasing for periodic functions.
    let total = 0;
    for (let i = 0; i < 16; i++) {
      const l = a + (b - a) * i / 16, r = a + (b - a) * (i + 1) / 16;
      const fl = at(l), fm = at((l + r) / 2), fr = at(r), whole = simpson(l, r, fl, fm, fr);
      total += refine(l, r, fl, fm, fr, whole, 1e-9 * Math.max(1, Math.abs(whole)) / 16, 18);
    }
    if (!Number.isFinite(total)) throw Error('Integral is outside the supported numeric range.');
    return sign * total;
  }
  function series(calculator, source, variableName, lower, upper, product = false) {
    const v = name(variableName);
    if (!Number.isSafeInteger(lower) || !Number.isSafeInteger(upper) || upper < lower || upper - lower > 9999) throw Error('Use increasing whole-number bounds with at most 10,000 terms.');
    const f = calculator.compile(source, [v]);
    let result = product ? 1 : 0;
    for (let i = lower; i <= upper; i++) result = product ? result * f({ [v]: i }) : result + f({ [v]: i });
    if (!Number.isFinite(result)) throw Error('Result is outside the supported numeric range.');
    return result;
  }
  function counting(n, r, permutations = false) {
    if (!Number.isSafeInteger(n) || !Number.isSafeInteger(r) || r < 0 || n < r || n > 10000) throw Error('Use whole numbers with 0 ≤ r ≤ n ≤ 10,000.');
    let result = 1;
    const k = permutations ? r : Math.min(r, n - r);
    for (let i = 1; i <= k; i++) result *= (n - i + 1) / (permutations ? 1 : i);
    if (!Number.isFinite(result)) throw Error('Result is too large.');
    return Math.round(result);
  }
  const exported = { indefinite, definite, series, counting, name };
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  else root.AACMathTools = exported;
})(typeof globalThis !== 'undefined' ? globalThis : this);

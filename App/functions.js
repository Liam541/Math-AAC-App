/* Math engine and UI. Input is parsed; it is never executed as JavaScript. */
(function (root) {
  'use strict';
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const factorial = n => {
    if (!Number.isInteger(n) || n < 0 || n > 170) throw Error('Factorial needs a whole number from 0 to 170.');
    let value = 1;
    for (let i = 2; i <= n; i++) value *= i;
    return value;
  };
  // Keep the existing calculator convention: log and ln are natural logs.
  const builtins = Object.assign(Object.create(null), {
    sin: Math.sin, cos: Math.cos, tan: Math.tan,
    asin: Math.asin, acos: Math.acos, atan: Math.atan,
    sqrt: Math.sqrt, cbrt: Math.cbrt, log: Math.log, ln: Math.log,
    log10: Math.log10, exp: Math.exp, ceil: Math.ceil, floor: Math.floor,
    abs: Math.abs, sign: Math.sign, factorial,
  });
  const constants = Object.assign(Object.create(null), { pi: Math.PI, e: Math.E });
  const isIntegral = name => name === 'integral' || name === 'integrate';
  const reserved = name => own(builtins, name) || own(constants, name) || name === 'Ans' || isIntegral(name);
  const greek = { α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', θ: 'theta', λ: 'lambda', μ: 'mu', σ: 'sigma', φ: 'phi', ω: 'omega' };
  function normalize(source) {
    if (typeof source !== 'string' || source.length > 2000) throw Error('Use an expression under 2,000 characters.');
    return source.replace(/[αβγδθλμσφω]/g, letter => greek[letter]).replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-')
      .replace(/π/g, ' pi ').replace(/√/g, 'sqrt').replace(/²/g, '^2').replace(/³/g, '^3')
      .replace(/\*\*/g, '^').trim();
  }
  function parse(source, parameters = []) {
    const tokens = [];
    let rest = normalize(source);
    while (rest.length) {
      const match = /^(?:\s+|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z][A-Za-z0-9_]*|[+*/^%(),!|\-])/.exec(rest);
      if (!match) throw Error('Unexpected input near "' + rest.slice(0, 16) + '".');
      if (match[0].trim()) tokens.push(match[0]);
      rest = rest.slice(match[0].length);
    }
    if (!tokens.length) throw Error('Enter an expression or a definition such as f(x)=2x+3.');
    if (tokens.length > 400) throw Error('This expression is too long.');
    let position = 0;
    const peek = () => tokens[position];
    const take = token => { if (peek() === token) { position++; return true; } return false; };
    const expect = token => { if (!take(token)) throw Error('Expected "' + token + '".'); };
    const startsPrimary = token => token && (/^[\d.A-Za-z]/.test(token) || token === '(');
    function primary() {
      const token = tokens[position++];
      let node;
      if (token === '(') { node = expression(); expect(')'); }
      else if (token === '|') { node = { type: 'call', name: 'abs', args: [expression()] }; expect('|'); }
      else if (token && /^[\d.]/.test(token)) node = { type: 'number', value: Number(token) };
      else if (token && /^[A-Za-z]/.test(token)) {
        // A parameter followed by parentheses means multiplication: x(x+1).
        if (!parameters.includes(token) && !own(constants, token) && token !== 'Ans' && take('(')) {
          const args = [];
          if (!take(')')) { do { args.push(expression()); } while (take(',')); expect(')'); }
          node = { type: 'call', name: token, args };
          if (isIntegral(token) && args[1]?.type === 'variable') {
            // The integration variable binds inside the integrand, including x(x+1).
            walk(args[0], child => {
              if (child.type === 'call' && child.name === args[1].name && child.args.length === 1) {
                const argument = child.args[0];
                Object.assign(child, { type: 'binary', op: '*', left: { type: 'variable', name: child.name }, right: argument });
                delete child.name; delete child.args;
              }
            });
          }
        } else node = { type: 'variable', name: token };
      } else throw Error('Expected a number, variable, or function.');
      while (take('!')) node = { type: 'call', name: 'factorial', args: [node] };
      return node;
    }
    function power() {
      const left = primary();
      return take('^') ? { type: 'binary', op: '^', left, right: unary() } : left;
    }
    function unary() {
      if (take('+')) return unary();
      if (take('-')) return { type: 'negate', value: unary() };
      return power();
    }
    function product() {
      let left = unary();
      while (['*', '/', '%'].includes(peek()) || startsPrimary(peek())) {
        if (/^[\d.]/.test(peek()) && /^[\d.]/.test(tokens[position - 1])) {
          throw Error('Use an operator between numbers.');
        }
        const op = ['*', '/', '%'].includes(peek()) ? tokens[position++] : '*';
        left = { type: 'binary', op, left, right: unary() };
      }
      return left;
    }
    function expression() {
      let left = product();
      while (peek() === '+' || peek() === '-') {
        const op = tokens[position++];
        left = { type: 'binary', op, left, right: product() };
      }
      return left;
    }
    const tree = expression();
    if (position !== tokens.length) throw Error('Unexpected "' + peek() + '". Check parentheses and operators.');
    return tree;
  }
  function walk(node, visit) {
    visit(node);
    if (node.type === 'binary') { walk(node.left, visit); walk(node.right, visit); }
    if (node.type === 'negate') walk(node.value, visit);
    if (node.type === 'call') node.args.forEach(arg => walk(arg, visit));
  }
  function calculatorSource(source) {
    if (typeof source !== 'string' || source.length > 2000) return normalize(source);
    const integralText = /^(?:Integral\s*:|∫)\s*(.+)$/i.exec(source.trim());
    if (!integralText) return source;
    const differential = /^(.*?)\s+d([A-Za-zαβγδθλμσφω][A-Za-z0-9_]*)\s*$/.exec(integralText[1]);
    return `integral(${differential ? differential[1] : integralText[1]},${differential ? differential[2] : 'x'})`;
  }
  function validateExpression(node, parameters, definitions, symbolic = false) {
    if (node.type === 'variable' && !parameters.includes(node.name) && !own(constants, node.name) && node.name !== 'Ans') {
      throw Error('Unknown variable "' + node.name + '". Include it in the function parameters or enter a value.');
    }
    if (node.type === 'negate') validateExpression(node.value, parameters, definitions);
    if (node.type === 'binary') { validateExpression(node.left, parameters, definitions); validateExpression(node.right, parameters, definitions); }
    if (node.type !== 'call') return;
    if (isIntegral(node.name)) {
      if (![2, 4].includes(node.args.length)) throw Error('Use integral(expression, variable) or integral(expression, variable, lower, upper).');
      if (node.args[1].type !== 'variable' || reserved(node.args[1].name)) throw Error('Choose an integration variable such as x or t.');
      if (node.args.length === 2 && !symbolic) throw Error('Use an indefinite integral on its own, or add lower and upper bounds for a numeric result.');
      validateExpression(node.args[0], [...parameters, node.args[1].name], definitions);
      node.args.slice(2).forEach(bound => validateExpression(bound, parameters, definitions));
      return;
    }
    const arity = own(builtins, node.name) ? 1 : definitions.get(node.name)?.parameters.length;
    if (arity === undefined) throw Error('Unknown function "' + node.name + '". Define it first.');
    if (arity !== node.args.length) throw Error(node.name + ' expects ' + arity + ' argument(s).');
    node.args.forEach(arg => validateExpression(arg, parameters, definitions));
  }
  class Calculator {
    constructor() { this.definitions = new Map(); this.answer = 0; this.angleMode = 'radians'; }
    validate(definitions) {
      for (const definition of definitions.values()) {
        validateExpression(definition.tree, definition.parameters, definitions);
      }
      const complete = new Set();
      const active = new Set();
      const visit = name => {
        if (active.has(name)) throw Error('Circular function definitions are not supported.');
        if (complete.has(name)) return;
        active.add(name);
        walk(definitions.get(name).tree, node => {
          if (node.type === 'call' && definitions.has(node.name)) visit(node.name);
        });
        active.delete(name); complete.add(name);
      };
      definitions.forEach((_, name) => visit(name));
    }
    define(source) {
      const normalized = normalize(source);
      const match = /^([A-Za-z][A-Za-z0-9_]*)\s*\(([^()]*)\)\s*=\s*(.+)$/.exec(normalized)
        || (/^y\s*=/.test(normalized) ? [null, 'f', 'x', normalized.replace(/^y\s*=\s*/, '')] : null);
      if (!match) throw Error('Use a definition such as f(x)=2x+3 or h(x,y)=x+y.');
      const [, name, parameterText, body] = match;
      const parameters = parameterText.split(',').map(parameter => parameter.trim());
      if (reserved(name)) throw Error('Choose a name other than the built-in name "' + name + '".');
      if (parameters.length > 8 || parameters.some(p => !/^[A-Za-z][A-Za-z0-9_]*$/.test(p) || reserved(p) || p === name)) {
        throw Error('Use 1 to 8 distinct parameter names, such as x or t. Built-in names are reserved.');
      }
      if (new Set(parameters).size !== parameters.length) throw Error('Each parameter needs a different name.');
      const tree = parse(body, parameters);
      // Ans is captured at definition time so saved functions do not change with the last result.
      walk(tree, node => { if (node.type === 'variable' && node.name === 'Ans') { node.type = 'number'; node.value = this.answer; delete node.name; } });
      const definition = { name, parameters, body, tree, answer: this.answer, source: `${name}(${parameters.join(',')})=${body}` };
      const proposed = new Map(this.definitions);
      proposed.set(name, definition);
      if (proposed.size > 50) throw Error('Up to 50 functions can be stored.');
      this.validate(proposed);
      this.definitions = proposed;
      return { kind: 'definition', definition };
    }
    evaluate(source) {
      source = calculatorSource(source);
      if (source.includes('=')) return this.define(source);
      const tree = parse(source);
      validateExpression(tree, [], this.definitions, true);
      if (tree.type === 'call' && isIntegral(tree.name) && tree.args.length === 2) {
        return { kind: 'symbolic', value: indefinite(this, format(tree.args[0]), tree.args[1].name) };
      }
      const value = this.compileTree(tree, this.angleMode)();
      this.answer = value;
      return { kind: 'result', value };
    }
    preview(source) {
      const temporary = new Calculator();
      temporary.definitions = new Map(this.definitions);
      temporary.answer = this.answer;
      temporary.angleMode = this.angleMode;
      return temporary.evaluate(source);
    }
    compile(source, parameters = [], angleMode = 'radians') {
      const tree = parse(source, parameters);
      validateExpression(tree, parameters, this.definitions);
      return this.compileTree(tree, angleMode);
    }
    compileTree(tree, angleMode = 'radians') {
      return (variables = Object.create(null), budget = { remaining: 1000000 }) => {
        let remaining = 10000;
        const finite = value => {
          if (!Number.isFinite(value)) throw Error('Undefined in the real numbers. Check division by zero, roots, or logarithms.');
          return value;
        };
        const calculate = (node, scope = Object.create(null), depth = 0) => {
          if (--remaining < 0 || --budget.remaining < 0 || depth > 100) throw Error('This calculation is too complex.');
          if (node.type === 'number') return finite(node.value);
          if (node.type === 'variable') {
            if (own(scope, node.name)) return finite(scope[node.name]);
            if (own(constants, node.name)) return constants[node.name];
            if (node.name === 'Ans') return this.answer;
            throw Error('Unknown variable "' + node.name + '". Use a number, for example f(3).');
          }
          if (node.type === 'negate') return -calculate(node.value, scope, depth + 1);
          if (node.type === 'binary') {
            const a = calculate(node.left, scope, depth + 1), b = calculate(node.right, scope, depth + 1);
            return finite(({ '+': () => a + b, '-': () => a - b, '*': () => a * b,
              '/': () => a / b, '%': () => a % b, '^': () => a ** b })[node.op]());
          }
          if (isIntegral(node.name)) {
            if (node.args.length !== 4) throw Error('Add lower and upper bounds for a numeric integral.');
            const integrand = this.compileTree(node.args[0], 'radians');
            const lower = calculate(node.args[2], scope, depth + 1), upper = calculate(node.args[3], scope, depth + 1);
            return numericalIntegral(x => integrand({ ...scope, [node.args[1].name]: x }, budget), lower, upper);
          }
          const definition = this.definitions.get(node.name);
          const arity = own(builtins, node.name) ? 1 : definition?.parameters.length;
          if (arity === undefined) throw Error('Unknown function "' + node.name + '". Define it first, for example f(x)=2x+3.');
          if (node.args.length !== arity) throw Error(node.name + ' expects ' + arity + ' argument(s).');
          const values = node.args.map(arg => calculate(arg, scope, depth + 1));
          if (own(builtins, node.name)) {
            if (angleMode === 'degrees' && ['sin', 'cos', 'tan'].includes(node.name)) values[0] *= Math.PI / 180;
            let result = builtins[node.name](...values);
            if (angleMode === 'degrees' && ['asin', 'acos', 'atan'].includes(node.name)) result *= 180 / Math.PI;
            return finite(result);
          }
          const local = Object.create(null);
          definition.parameters.forEach((parameter, i) => { local[parameter] = values[i]; });
          return calculate(definition.tree, local, depth + 1);
        };
        return calculate(tree, variables);
      };
    }
    serialize() {
      // Persist source plus captured Ans, never an executable expression or serialized AST.
      return JSON.stringify([...this.definitions.values()].map(d => ({ source: d.source, answer: d.answer ?? 0 })));
    }
    restore(serialized) {
      const records = JSON.parse(serialized);
      if (!Array.isArray(records) || records.length > 50) throw Error('Invalid saved functions.');
      const fresh = new Calculator();
      // Redefinition can reorder dependencies; retry until all dependencies have loaded.
      let pending = records;
      while (pending.length) {
        const retry = [];
        for (const record of pending) {
          try {
            if (!record || typeof record.source !== 'string' || !Number.isFinite(record.answer)) throw Error('Invalid saved function.');
            fresh.answer = record.answer;
            fresh.define(record.source);
          } catch (_) { retry.push(record); }
        }
        if (retry.length === pending.length) throw Error('Could not restore saved functions.');
        pending = retry;
      }
      this.definitions = fresh.definitions;
    }
  }
  const api = { Calculator, parse, normalize, reserved, greek };

  // Calculus and discrete mathematics.
  const num = value => ({ type: 'number', value });
  const variable = name => ({ type: 'variable', name });
  const call = (name, arg) => ({ type: 'call', name, args: [arg] });
  function binary(op, left, right) {
    if (left.type === 'number' && right.type === 'number') {
      const a = left.value, b = right.value;
      const value = ({ '+': () => a + b, '-': () => a - b, '*': () => a * b, '/': () => a / b, '^': () => a ** b })[op]?.();
      if (Number.isFinite(value)) return num(value);
    }
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
    if (node.type === 'negate') return `(-${format(node.value)})`;
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
    const unsupported = () => { throw Error('No symbolic rule for this expression. Try polynomials, sin, cos, exp, or 1/x; use definite mode for other continuous functions.'); };
    function polynomial(n) {
      if (!depends(n, v)) return [constant(n)];
      if (n.type === 'variable') return [0, 1];
      if (n.type !== 'binary') return unsupported();
      const a = polynomial(n.left), b = polynomial(n.right);
      const multiply = (left, right) => {
        if (left.length + right.length > 102) return unsupported();
        const result = Array(left.length + right.length - 1).fill(0);
        left.forEach((coefficient, i) => right.forEach((other, j) => { result[i + j] += coefficient * other; }));
        if (result.some(value => !Number.isFinite(value))) return unsupported();
        return result;
      };
      if (n.op === '+' || n.op === '-') return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] || 0) + (n.op === '+' ? 1 : -1) * (b[i] || 0));
      if (n.op === '*') return multiply(a, b);
      if (n.op === '/' && b.length === 1 && b[0] !== 0) return a.map(coefficient => coefficient / b[0]);
      if (n.op === '^' && b.length === 1 && Number.isInteger(b[0]) && b[0] >= 0 && b[0] <= 30) {
        let result = [1];
        for (let i = 0; i < b[0]; i++) result = multiply(result, a);
        return result;
      }
      return unsupported();
    }
    function integratePolynomial(n) {
      return polynomial(n).reduce((result, coefficient, degree) => {
        if (coefficient === 0) return result;
        const numerator = binary('*', num(coefficient), binary('^', variable(v), num(degree + 1)));
        return binary('+', result, binary('/', numerator, num(degree + 1)));
      }, num(0));
    }
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
        if (op === '^' && !depends(right, v)) {
          try { return power(left, constant(right)); } catch (_) { return integratePolynomial(n); }
        }
        if (op === '^' && !depends(left, v)) {
          const base = constant(left), a = slope(right);
          if (base > 0 && base !== 1 && a) return binary('/', n, num(a * Math.log(base)));
        }
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
      return integratePolynomial(n);
    }
    return format(integrate(tree)) + ' + C';
  }
  function definite(calculator, source, variableName, lower, upper) {
    const v = name(variableName), f = calculator.compile(source, [v]);
    return numericalIntegral(x => f({ [v]: x }), lower, upper);
  }
  function numericalIntegral(f, lower, upper) {
    if (!Number.isFinite(lower) || !Number.isFinite(upper) || !Number.isFinite(upper - lower)) throw Error('Use finite bounds and a finite interval. Improper integrals are not supported.');
    let evaluations = 0;
    const at = x => { if (++evaluations > 100000) throw Error('Integral did not converge. Check the interval for discontinuities.'); return f(x); };
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
    // Unequal intervals avoid sampling periodic functions at the same phase.
    let total = 0;
    for (let i = 0; i < 16; i++) {
      const l = a + (b - a) * (i / 16) ** 1.5, r = a + (b - a) * ((i + 1) / 16) ** 1.5;
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
    let result = 1n;
    const k = permutations ? r : Math.min(r, n - r);
    for (let i = 1; i <= k; i++) result = result * BigInt(n - i + 1) / BigInt(permutations ? 1 : i);
    const numeric = Number(result);
    if (!Number.isFinite(numeric)) throw Error('Result is too large.');
    return numeric;
  }

  /* Use the existing display, result history, status area, and calculator buttons. */
  function initializeFunctions() {
    'use strict';
    const calculator = new Calculator();
    window.mathCalculator = calculator;
    const input = document.querySelector('#display');
    const statusArea = document.querySelector('#status');
    const storageKey = 'math-aac-functions-v1';
    const get = id => document.querySelector('#' + id);
    const rule = get('function-rule');
    const argumentsInput = get('function-arguments');
    const resultArea = get('function-result');
    const liveResult = get('calculator-result');
    const history = [];
    let keypadInput = rule;
    function report(message) {
      statusArea.textContent = message;
      resultArea.textContent = message;
      liveResult.textContent = message;
    }
    function renderFunctions(selectedName) {
      for (const id of ['saved-function', 'compose-function']) {
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
      if (window.sharedMath) window.sharedMath.changed(field);
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
    window.restoreFunctions = saved => {
      calculator.restore(saved);
      renderFunctions();
      try { localStorage.setItem(storageKey, calculator.serialize()); } catch (_) {}
    };
    const formatResult = result => result.kind === 'symbolic' ? result.value
      : Number.isSafeInteger(result.value) ? String(result.value) : String(Number(result.value.toPrecision(12)));
    window.previewCalculator = () => {
      if (!get('math').classList.contains('active')) return;
      if (window.calculatorAccess?.refresh()) return;
      if (window.calculatorAccess && !get('calculator-preview').checked) { liveResult.textContent = 'Press Solve when you are ready. Your entry will stay available.'; return; }
      if (!input.value.trim()) { liveResult.textContent = 'Enter an expression to see its solution.'; return; }
      try {
        const published = window.sharedMath?.current();
        if (published) { liveResult.textContent = published.text; return; }
        if (window.sharedMath?.target()) { liveResult.textContent = 'Press Solve to calculate the selected tool.'; return; }
        const result = calculator.preview(input.value);
        liveResult.textContent = result.kind === 'definition'
          ? result.definition.source + ' — press ENTER to save, then enter a value such as ' + result.definition.name + '(3).'
          : '= ' + formatResult(result);
      } catch (error) { liveResult.textContent = window.calculatorAccess?.friendlyError(error) || error.message; }
    };
    let previewTimer;
    window.scheduleCalculatorPreview = () => {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(window.previewCalculator, 200);
    };
    input.addEventListener('input', window.scheduleCalculatorPreview);
    window.evaluate = function (source) {
      const undoPoint = window.sharedMath?.checkpoint();
      clearTimeout(previewTimer);
      try {
        const expression = source ?? (window.sharedMath?.current()?.source || input.value);
        const result = calculator.evaluate(expression);
        window.sharedMath?.choose(null);
        if (result.kind === 'definition') {
          const definition = result.definition;
          input.value = definition.source;
          let saved = true;
          try { localStorage.setItem(storageKey, calculator.serialize()); } catch (_) { saved = false; }
          renderFunctions(definition.name);
          report((saved ? 'Saved ' : 'Defined for this session: ') + definition.source
            + '. Enter a value below or use it in the calculator.');
        } else {
          const formatted = formatResult(result);
          if (result.kind === 'result') {
            input.value = formatted;
            input.dataset.lastResult = String(result.value);
          }
          lastResult = formatted;
          history.unshift(expression + ' = ' + formatted);
          if (history.length > 20) history.pop();
          report('Result: ' + formatted);
          const tree = parse(calculatorSource(expression));
          if (tree.type === 'call' && isIntegral(tree.name)) {
            const notation = tree.args.length === 4
              ? `∫ from ${format(tree.args[2])} to ${format(tree.args[3])} of (${format(tree.args[0])}) d${format(tree.args[1])} ≈ ${formatted}`
              : `∫ (${format(tree.args[0])}) d${format(tree.args[1])} = ${formatted}`;
            window.sharedMath?.publish(notation, expression, result.kind === 'symbolic' ? formatted.replace(/ \+ C$/, '') : formatted);
            window.calculatorAccess?.solved(notation.split(tree.args.length === 4 ? ' ≈ ' : ' = ')[0], formatted, tree.args.length === 4);
          } else window.calculatorAccess?.solved(expression, formatted);
        }
      } catch (error) {
        window.sharedMath?.discardCheckpoint(undoPoint);
        window.calculatorAccess?.editing();
        report('Could not evaluate: ' + (window.calculatorAccess?.friendlyError(error) || error.message));
      }
    };
    window.showEquationHistory = () => report(history.length ? 'Recent equations: ' + history.join('; ') : 'Equation history is empty.');
    window.toggleCalculatorMode = () => {
      calculator.angleMode = calculator.angleMode === 'radians' ? 'degrees' : 'radians';
      if (get('calculator-angle')) {
        get('calculator-angle').textContent = calculator.angleMode === 'radians' ? 'Radians' : 'Degrees';
        get('calculator-angle').setAttribute('aria-label', 'Angle mode: ' + calculator.angleMode + '. Press to change.');
      }
      report('Calculator angle mode: ' + calculator.angleMode + '. Graphs and integrals use radians.');
    };
    window.toggleCalculatorSign = () => {
      window.sharedMath?.checkpoint();
      const start = input.selectionStart ?? 0, end = input.selectionEnd ?? input.value.length;
      const selected = start !== end;
      const source = (selected ? input.value.slice(start, end) : input.value).trim();
      let replacement = source ? '-(' + source + ')' : '-';
      try { if (parse(source).type === 'negate') replacement = source.slice(1); } catch (_) { if (source === '-') replacement = ''; }
      if (selected) input.setRangeText(replacement, start, end, 'end');
      else input.value = replacement;
      input.focus();
      window.sharedMath?.changed();
      window.scheduleCalculatorPreview();
    };
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); (window.sharedMath?.solve || window.evaluate)(); }
    });
    document.querySelector('#show-functions').addEventListener('click', () => {
      const definitions = [...calculator.definitions.values()];
      report(definitions.length
        ? 'Saved functions: ' + definitions.map(d => d.source).join('; ') + '. To change one, enter its new definition.'
        : 'No saved functions. Enter a rule above and press Save function.');
    });
    for (const [field, label] of [[rule, 'Rule'], [argumentsInput, 'Evaluate at'], [input, 'Display'], [get('function-name'), 'Function name'], [get('function-parameters'), 'Variables']]) {
      field.addEventListener('focus', () => {
        keypadInput = field;

      });
    }
    // Common-function buttons already call append(); route them to the chosen field only here.
    window.insertFunctionValue = value => {
      if (!get('math').classList.contains('active')) return false;
      if (get('basic').classList.contains('active')) insertAt(input, value);
      else if (get('functions').classList.contains('active')) insertAt(keypadInput, value);
      else return false;
      window.scheduleCalculatorPreview();
      return true;
    };
    window.backspaceMath = () => {
      if (window.sharedMath) { window.sharedMath.erase(); return true; }
      if (!get('math').classList.contains('active') || !get('basic').classList.contains('active')) return false;
      const end = input.selectionEnd ?? input.value.length;
      const start = input.selectionStart ?? end;
      input.setRangeText('', start === end ? Math.max(0, start - 1) : start, end, 'end');
      input.focus();
      window.sharedMath?.changed();
      window.scheduleCalculatorPreview();
      return true;
    };
    get('save-function').addEventListener('click', () => {
      window.evaluate(`${get('function-name').value.trim()}(${get('function-parameters').value.trim()})=${rule.value.trim()}`);
    });
    rule.addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); get('save-function').click(); }
    });
    get('edit-function').addEventListener('click', () => {
      const definition = selected();
      if (!definition) return;
      window.sharedMath?.checkpoint();
      get('function-name').value = definition.name;
      get('function-parameters').value = definition.parameters.join(',');
      rule.value = definition.body;
      window.showToolPage?.('function-define');
      rule.focus();
      report('Editing ' + definition.source + '. Press Save function to apply changes.');
    });
    function useInCalculator(id) {
      const definition = selected(id);
      if (!definition) return;
      window.sharedMath?.checkpoint();
      window.sharedMath?.choose(null);
      openMath('basic');
      // A completed definition/result is replaced; unfinished arithmetic keeps its insertion point.
      if (input.value.includes('=') || input.value === lastResult) input.value = '';
      insertAt(input, definition.name + '()', true);
      report('Enter ' + definition.parameters.join(', ') + ' inside the parentheses, then press ENTER.');
    }
    get('use-function').addEventListener('click', () => useInCalculator('saved-function'));

    get('insert-function').addEventListener('click', () => {
      const definition = selected();
      if (definition) {
        window.sharedMath?.checkpoint();
        insertAt(window.sharedMath ? input : keypadInput, definition.name + '()', true);
      }
    });
    function evaluateSelected(compose) {
      const outer = selected();
      const inner = compose ? selected('compose-function') : null;
      if (!outer || (compose && !inner)) return;
      if (!argumentsInput.value.trim()) { report('Enter a value in Evaluate at first.'); window.showToolPage?.('function-evaluate'); argumentsInput.focus(); return; }
      const expression = compose
        ? `${outer.name}(${inner.name}(${argumentsInput.value}))`
        : `${outer.name}(${argumentsInput.value})`;
      window.evaluate(expression);
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
      const definition = calculator.definitions.get(button.dataset.functionTemplate);
      get('function-parameters').value = definition?.parameters.join(',') || 'x';
      rule.value = definition?.body || '';
      rule.focus();
    }));
    statusArea.setAttribute('role', 'status');
    statusArea.setAttribute('aria-live', 'polite');
  }

  function initializeMathTools() {
    'use strict';
    const get = id => document.getElementById(id);
    const calculator = window.mathCalculator, math = api;
    const value = id => get(id).value.trim();
    const numeric = id => calculator.compile(value(id))();
    const formatted = n => Number.isSafeInteger(n) ? String(n) : String(Number(n.toPrecision(12)));
    function report(id, text) { get(id).textContent = text; setStatus(text); }
    function run(id, action) {
      try { report(id, action()); get(id).dataset.valid = 'true'; }
      catch (error) { report(id, 'Could not calculate: ' + error.message); get(id).dataset.valid = 'false'; }
    }
    function insert(field, text) {
      field.setRangeText(text, field.selectionStart ?? field.value.length, field.selectionEnd ?? field.value.length, 'end');
      field.focus();
    }
    let definite = true;
    window.integralSource = () => `integral(${value('integral-expression')},${value('integral-variable')}${definite ? `,(${value('integral-lower')}),(${value('integral-upper')})` : ''})`;
    let integralTimer;
    const integralFields = ['lower', 'upper', 'expression', 'variable'];
    function focusIntegralField(part) {
      const field = get('integral-' + part);
      field.focus();
      field.select();
    }
    for (const part of integralFields) {
      get('integral-' + part).addEventListener('input', scheduleIntegral);
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
      for (const [id, selected] of [['integral-definite', definite], ['integral-indefinite', !definite]]) {
        get(id).setAttribute('aria-pressed', String(selected)); get(id).classList.toggle('blue', selected);
      }
      get('integral-result').textContent = 'Ready to calculate ' + (definite ? 'a definite integral.' : 'an antiderivative.');
      focusIntegralField(definite ? 'lower' : 'expression');
      solveIntegral(true);
    }
    get('integral-indefinite').onclick = () => setIntegralMode(false);
    get('integral-definite').onclick = () => setIntegralMode(true);
    function solveIntegral(quiet = false, record = true) {
      const undoPoint = !quiet && record ? window.sharedMath?.checkpoint() : null;
      clearTimeout(integralTimer);
      if (quiet && window.calculatorAccess && !get('calculator-preview').checked) {
        get('integral-result').textContent = 'Press Solve when you are ready.';
        return null;
      }
      try {
      const required = definite ? integralFields : ['expression', 'variable'];
      for (const part of required) {
        if (!value('integral-' + part)) {
          if (!quiet) focusIntegralField(part);
          throw Error('Enter ' + ({ lower: 'a lower bound', upper: 'an upper bound', expression: 'an expression', variable: 'a variable' })[part] + ' in the highlighted slot.');
        }
      }
      const expression = value('integral-expression'), v = value('integral-variable');
      const source = `integral(${expression},${v}${definite ? `,(${value('integral-lower')}),(${value('integral-upper')})` : ''})`;
      const result = quiet ? calculator.preview(source) : calculator.evaluate(source);
      const message = definite
        ? `∫ from ${value('integral-lower')} to ${value('integral-upper')} of (${expression}) d${v} ≈ ${formatted(result.value)}`
        : `∫ (${expression}) d${v} = ${result.value}`;
      get('integral-result').textContent = message;
      if (!quiet) {
        const answer = result.kind === 'symbolic' ? result.value.replace(/ \+ C$/, '') : formatted(result.value);
        window.sharedMath?.publish(message, source, answer);
        window.calculatorAccess?.solved(message.split(definite ? ' ≈ ' : ' = ')[0], definite ? formatted(result.value) : result.value, definite);
        setStatus(message);
      }
      return result;
      } catch (error) {
        window.sharedMath?.discardCheckpoint(undoPoint);
        get('integral-result').textContent = 'Could not calculate: ' + (window.calculatorAccess?.friendlyError(error) || error.message);
        if (!quiet) window.calculatorAccess?.editing();
        if (!quiet) setStatus(get('integral-result').textContent);
        return null;
      }
    }
    function scheduleIntegral() {
      clearTimeout(integralTimer);
      get('integral-result').textContent = 'Updating solution…';
      integralTimer = setTimeout(() => solveIntegral(true), 200);
    }
    window.solveIntegral = solveIntegral;
    get('integral-calculate').onclick = () => solveIntegral();
    get('integral-example').onclick = () => {
      window.sharedMath?.checkpoint();
      get('integral-expression').value = 'x^2';
      get('integral-variable').value = 'x';
      get('integral-lower').value = '0';
      get('integral-upper').value = '3';
      setIntegralMode(true);
      solveIntegral(false, false);
    };
    window.openIntegral = () => {
      window.sharedMath?.checkpoint();
      selectTab('math'); selectSubtab(document.querySelector('[data-subtab="calculus"]'));
      const source = window.sharedMath?.current()?.source || value('display');
      if (source) {
        try {
          const tree = parse(calculatorSource(source));
          if (tree.type === 'call' && isIntegral(tree.name) && [2, 4].includes(tree.args.length)) {
            get('integral-expression').value = format(tree.args[0]);
            get('integral-variable').value = format(tree.args[1]);
            if (tree.args.length === 4) {
              get('integral-lower').value = format(tree.args[2]);
              get('integral-upper').value = format(tree.args[3]);
            }
            setIntegralMode(tree.args.length === 4);
            return;
          }
        } catch (_) { /* Keep unfinished input editable in the integrand slot. */ }
        get('integral-expression').value = source.replace(/^(?:Integral\s*:|∫)\s*/i, '');
      }
      focusIntegralField('expression');
      solveIntegral(true);
    };
    document.querySelector('[data-subtab="calculus"]').addEventListener('click', () => solveIntegral(true));
    let greekVariable = 'θ';
    for (const [letter, name] of Object.entries(greek)) {
      const button = document.createElement('button'); button.className = 'button';
      button.textContent = letter + ' · ' + name; button.setAttribute('aria-label', name);
      button.onclick = () => {
        greekVariable = letter;
        get('greek-function').textContent = 'Define with ' + letter;
        if (window.sharedMath) window.sharedMath.edit(letter);
        else insert(get('display'), letter);
      };
      get('greek-letters').append(button);
    }
    get('greek-define').onclick = () => window.evaluate();
    get('greek-function').onclick = () => {
      get('function-parameters').value = greekVariable;
      selectTab('math'); selectSubtab(document.querySelector('[data-subtab="functions"]'));
      window.showToolPage?.('function-define');
      get('function-rule').focus();
      setStatus('Write a rule using ' + greekVariable + ', then save the function.');
    };
    function discreteMode() {
      const op = value('discrete-operation');
      const groups = { series: ['sum', 'product'], counting: ['choose', 'permute'], sets: ['union', 'intersection', 'difference'], logic: ['and', 'or', 'implies'] };
      for (const [group, ops] of Object.entries(groups)) get('discrete-' + group).hidden = !ops.includes(op);
      if (window.sharedMath?.target()?.closest('[hidden]')) window.sharedMath.choose(null);
      get('discrete-result').textContent = 'Enter values for ' + get('discrete-operation').selectedOptions[0].textContent + '.';
      get('discrete-result').dataset.valid = 'false';
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
      if (button.dataset.toolDisplay === 'integral-expression') { window.openIntegral(); return; }
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
      if (value('graph-function')) {
        window.sharedMath?.checkpoint();
        get('graph-expression').value = value('graph-function') + '(x)';
        window.sharedMath?.changed(get('graph-expression'));
        plot();
      }
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
        return visible ? `y = ${expression}. Plotted over ${formatted(xmin)} ≤ x ≤ ${formatted(xmax)}.` : 'No curve is visible in this y window. Adjust the y bounds.';
      });
    }
    get('graph-plot').onclick = plot;
    get('graph-reset').onclick = () => {
      window.sharedMath?.checkpoint();
      for (const axis of ['x', 'y']) { get('graph-' + axis + 'min').value = '-10'; get('graph-' + axis + 'max').value = '10'; }
      const target = window.sharedMath?.target();
      if (target?.id.startsWith('graph-')) window.sharedMath.changed(target);
      plot();
    };
    get('graph-use-display').onclick = () => {
      const source = get('display').value.trim();
      if (!source) { setStatus('Input a graph expression in the math bar first.'); return; }
      window.sharedMath?.checkpoint();
      const definition = /^([A-Za-z][A-Za-z0-9_]*)\s*\([^)]*\)\s*=/.exec(source);
      get('graph-expression').value = definition && calculator.definitions.has(definition[1]) ? definition[1] + '(x)' : source.replace(/^y\s*=\s*/, '');
      window.sharedMath?.changed(get('graph-expression'));
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

    for (const [panel, action] of [['calculus', 'integral-calculate'], ['discrete', 'discrete-calculate'], ['graphing', 'graph-plot']]) {
      get(panel).querySelectorAll('input').forEach(field => {
        field.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); get(field.id === 'graph-at' ? 'graph-evaluate' : action).click(); } });
      });
    }
    refreshFunctions();
  }

  function speechSource(source) {
    let text = source;
    try {
      const tree = parse(calculatorSource(source));
      if (tree.type === 'call' && isIntegral(tree.name) && [2, 4].includes(tree.args.length)) {
        text = '∫ ' + (tree.args.length === 4 ? `from ${format(tree.args[2])} to ${format(tree.args[3])} of ` : '')
          + `(${format(tree.args[0])}) d${format(tree.args[1])}`;
      }
    } catch (_) { /* Messages and solved equations remain speakable. */ }
    if (text.includes('∫')) text = text.replace(/\bd([A-Za-zαβγδθλμσφω][A-Za-z0-9_]*)(?=\s*(?:[=≈]|$))/g, ' with respect to $1 ');
    return text.replace(/≈/g, ' approximately equals ');
  }
  Object.assign(api, { indefinite, definite, series, counting, name, speechSource, initializeFunctions, initializeMathTools });
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.AACFunctions = api;
    initializeFunctions();
    initializeMathTools();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

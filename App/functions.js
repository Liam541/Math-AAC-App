/* Offline expression parser and named functions. Input is never executed as JavaScript. */
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
  const reserved = name => own(builtins, name) || own(constants, name) || name === 'Ans';
  function normalize(source) {
    if (typeof source !== 'string' || source.length > 2000) throw Error('Use an expression under 2,000 characters.');
    return source.replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-')
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
  class Calculator {
    constructor() { this.definitions = new Map(); this.answer = 0; }
    validate(definitions) {
      for (const definition of definitions.values()) {
        walk(definition.tree, node => {
          if (node.type === 'variable' && !definition.parameters.includes(node.name) && !own(constants, node.name)) {
            throw Error('Unknown variable "' + node.name + '". Include it in the function parameters.');
          }
          if (node.type === 'call') {
            const arity = own(builtins, node.name) ? 1 : definitions.get(node.name)?.parameters.length;
            if (arity === undefined) throw Error('Define ' + node.name + ' before using it.');
            if (arity !== node.args.length) throw Error(node.name + ' expects ' + arity + ' argument(s).');
          }
        });
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
      if (source.includes('=')) return this.define(source);
      const tree = parse(source);
      let remaining = 10000;
      const finite = value => {
        if (!Number.isFinite(value)) throw Error('Undefined in the real numbers. Check division by zero, roots, or logarithms.');
        return value;
      };
      const calculate = (node, scope = Object.create(null), depth = 0) => {
        if (--remaining < 0 || depth > 100) throw Error('This calculation is too complex.');
        if (node.type === 'number') return finite(node.value);
        if (node.type === 'variable') {
          if (own(scope, node.name)) return scope[node.name];
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
        const definition = this.definitions.get(node.name);
        const arity = own(builtins, node.name) ? 1 : definition?.parameters.length;
        if (arity === undefined) throw Error('Unknown function "' + node.name + '". Define it first, for example f(x)=2x+3.');
        if (node.args.length !== arity) throw Error(node.name + ' expects ' + arity + ' argument(s).');
        const values = node.args.map(arg => calculate(arg, scope, depth + 1));
        if (own(builtins, node.name)) return finite(builtins[node.name](...values));
        const local = Object.create(null);
        definition.parameters.forEach((parameter, i) => { local[parameter] = values[i]; });
        return calculate(definition.tree, local, depth + 1);
      };
      const value = calculate(tree);
      this.answer = value;
      return { kind: 'result', value };
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
  const api = { Calculator };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AACFunctions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

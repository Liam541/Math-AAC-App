/* Real-valued scientific math. No eval, Function, property access, or network dependencies. */
(function (root) {
  'use strict';
  const finite = value => {
    if (!Number.isFinite(value)) throw Error('Result is undefined or outside the supported number range.');
    return value;
  };
  function factorial(n) {
    if (!Number.isInteger(n) || n < 0 || n > 170) throw Error('Factorial needs a whole number from 0 to 170.');
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
  }
  function compile(source, { angle = 'rad', ans = 0, variable = 'x' } = {}) {
    if (typeof source !== 'string' || !source.trim()) throw Error('Enter an expression first.');
    if (source.length > 1000) throw Error('Use an expression shorter than 1,000 characters.');
    const scale = angle === 'deg' ? Math.PI / 180 : 1;
    const functions = {
      sin: x => Math.sin(x * scale), cos: x => Math.cos(x * scale),
      tan: x => { if (Math.abs(Math.cos(x * scale)) < 1e-14) throw Error('Tangent is undefined here.'); return Math.tan(x * scale); },
      asin: x => Math.asin(x) / scale, acos: x => Math.acos(x) / scale, atan: x => Math.atan(x) / scale,
      sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
      sqrt: Math.sqrt, cbrt: Math.cbrt, ln: Math.log, log: Math.log10, log10: Math.log10,
      exp: Math.exp, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, sign: Math.sign,
      factorial,
      ncr: (n, r) => {
        if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || n > 170 || r < 0 || r > n) throw Error('nCr needs whole numbers with 0 ≤ r ≤ n ≤ 170.');
        let result = 1;
        for (let k = 1; k <= Math.min(r, n - r); k++) result = result * (n - k + 1) / k;
        return result;
      },
      npr: (n, r) => {
        if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || n > 170 || r < 0 || r > n) throw Error('nPr needs whole numbers with 0 ≤ r ≤ n ≤ 170.');
        let result = 1;
        for (let k = 0; k < r; k++) result *= n - k;
        return result;
      },
      mod: (a, b) => a % b, min: Math.min, max: Math.max,
    };
    const normalized = source.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
      .replace(/π/g, ' pi ').replace(/√/g, 'sqrt').replace(/²/g, '^2').replace(/\*\*/g, '^');
    const tokens = [];
    const matcher = /\s*(?:(\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([a-zA-Z]+)|([+\-*/^!%(),]))/gy;
    let position = 0;
    while (position < normalized.length) {
      if (!normalized.slice(position).trim()) break;
      matcher.lastIndex = position;
      const match = matcher.exec(normalized);
      if (!match) throw Error('Unexpected symbol near “' + normalized.slice(position, position + 12).trim() + '”. Use expressions, not equations.');
      tokens.push({ type: match[1] ? 'number' : match[2] ? 'name' : match[3], value: match[1] || match[2]?.toLowerCase() || match[3] });
      position = matcher.lastIndex;
    }
    tokens.push({ type: 'end', value: '' });
    let index = 0, depth = 0;
    const peek = type => tokens[index].type === type;
    function take(type) {
      if (!peek(type)) throw Error('Expected “' + type + '” near “' + (tokens[index].value || 'end of expression') + '”.');
      return tokens[index++];
    }
    function primary() {
      if (++depth > 80) throw Error('Expression is nested too deeply.');
      let node;
      if (peek('number')) { const n = Number(take('number').value); finite(n); node = () => n; }
      else if (peek('(')) { take('('); node = addition(); take(')'); }
      else if (peek('name')) {
        const name = take('name').value;
        if (Object.hasOwn(functions, name)) {
          take('(');
          const args = [addition()];
          while (peek(',')) { take(','); args.push(addition()); }
          take(')');
          const expected = ['ncr', 'npr', 'mod', 'min', 'max'].includes(name) ? 2 : 1;
          if (args.length !== expected) throw Error(name + ' needs ' + expected + ' argument(s).');
          node = x => finite(functions[name](...args.map(arg => arg(x))));
        } else if (name === 'pi') node = () => Math.PI;
        else if (name === 'e') node = () => Math.E;
        else if (name === 'ans') node = () => ans;
        else if (name === variable) node = x => {
          if (x === undefined) throw Error('Use Calculator to evaluate functions with ' + variable + ', or Speak to read this expression.');
          return finite(x);
        };
        else throw Error('Unknown name “' + name + '”. Use explicit multiplication, e.g. 2*x.');
      } else throw Error('Expected a number, function, or opening parenthesis.');
      depth--;
      while (peek('!') || peek('%')) {
        const op = tokens[index++].type, previous = node;
        node = op === '!' ? x => factorial(previous(x)) : x => previous(x) / 100;
      }
      return node;
    }
    function power() {
      const left = primary();
      if (!peek('^')) return left;
      take('^');
      const right = unary();
      return x => finite(left(x) ** right(x));
    }
    function unary() {
      if (++depth > 80) throw Error('Expression is nested too deeply.');
      let node;
      if (peek('+') || peek('-')) {
        const sign = tokens[index++].type, operand = unary();
        node = x => (sign === '-' ? -1 : 1) * operand(x);
      } else node = power();
      depth--;
      return node;
    }
    function multiplication() {
      let node = unary();
      while (peek('*') || peek('/') || peek('(') || peek('name')) {
        const op = peek('*') || peek('/') ? tokens[index++].type : '*';
        const left = node, right = unary();
        node = x => finite(op === '*' ? left(x) * right(x) : left(x) / right(x));
      }
      return node;
    }
    function addition() {
      let node = multiplication();
      while (peek('+') || peek('-')) {
        const op = tokens[index++].type, left = node, right = multiplication();
        node = x => finite(op === '+' ? left(x) + right(x) : left(x) - right(x));
      }
      return node;
    }
    const expression = addition();
    take('end');
    return x => finite(expression(x));
  }
  const format = value => Object.is(value, -0) ? '0' : String(Number(finite(value).toPrecision(12)));
  const api = { compile, evaluate: (source, options) => compile(source, options)(), format };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AACMath = api;
})(globalThis);

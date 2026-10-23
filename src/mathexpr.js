// Tiny, safe parser for school function terms like `2x^2 - 3x + 1`,
// `sin(x)`, `1/2 x`, `sqrt(x+1)`, `0,5x`. No eval: the term is parsed into a
// tree, which can be evaluated and turned into Typst math for labels.
//
//   expr   := term (('+' | '-') term)*
//   term   := unary (('*' | '/' | implicit) unary)*
//   unary  := '-' unary | power
//   power  := atom ('^' unary)?
//   atom   := number | 'x' | const | func '(' expr ')' | '(' expr ')'

const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, sqrt: Math.sqrt, abs: Math.abs,
  ln: Math.log, log: Math.log10, lg: Math.log10, exp: Math.exp,
};
const CONSTS = { pi: Math.PI, e: Math.E };

function tokenize(src) {
  const s = String(src)
    .replace(/(\d),(\d)/g, '$1.$2')       // German decimal comma
    .replace(/[·×]/g, '*').replace(/[−–]/g, '-').replace(/÷|:/g, '/').replace(/²/g, '^2').replace(/³/g, '^3')
    .replace(/π/g, 'pi').replace(/√/g, 'sqrt');
  const out = [];
  const re = /\s*(?:(\d+(?:\.\d*)?|\.\d+)|([a-zA-Z]+)|(\S))/gy;
  let m;
  while (re.lastIndex < s.length && (m = re.exec(s))) {
    if (m[1]) out.push({ t: 'num', v: Number(m[1]) });
    else if (m[2]) {
      // split runs like "xsin" or "2pix" into known words and single x's
      let w = m[2].toLowerCase();
      while (w) {
        const known = [...Object.keys(FUNCS), ...Object.keys(CONSTS)].sort((a, b) => b.length - a.length).find((k) => w.startsWith(k));
        if (known) { out.push({ t: FUNCS[known] ? 'fn' : 'const', v: known }); w = w.slice(known.length); }
        else if (w[0] === 'x') { out.push({ t: 'x' }); w = w.slice(1); }
        else throw new Error(`Unknown name "${m[2]}"`);
      }
    } else if (m[3]) {
      if (!'+-*/^()'.includes(m[3])) throw new Error(`Unexpected "${m[3]}"`);
      out.push({ t: m[3] });
    }
  }
  return out;
}

export function parse(src) {
  const toks = tokenize(src);
  let i = 0;
  const peek = () => toks[i]?.t;
  const eat = (t) => {
    if (peek() !== t) throw new Error(`Expected "${t}"`);
    return toks[i++];
  };

  function expr() {
    let n = term();
    while (peek() === '+' || peek() === '-') n = { op: toks[i++].t, a: n, b: term() };
    return n;
  }
  function term() {
    let n = unary();
    for (;;) {
      const p = peek();
      if (p === '*' || p === '/') n = { op: toks[i++].t, a: n, b: unary() };
      else if (p === 'num' || p === 'x' || p === 'const' || p === 'fn' || p === '(') n = { op: '*', a: n, b: power(), implicit: true };
      else return n;
    }
  }
  function unary() {
    if (peek() === '-') { i++; return { op: 'neg', a: unary() }; }
    if (peek() === '+') { i++; return unary(); }
    return power();
  }
  function power() {
    const base = atom();
    if (peek() === '^') { i++; return { op: '^', a: base, b: unary() }; }
    return base;
  }
  function atom() {
    const tk = toks[i++];
    if (!tk) throw new Error('Incomplete term');
    if (tk.t === 'num') return { num: tk.v };
    if (tk.t === 'x') return { x: true };
    if (tk.t === 'const') return { c: tk.v };
    if (tk.t === 'fn') {
      if (peek() === '(') { i++; const a = expr(); eat(')'); return { fn: tk.v, a }; }
      return { fn: tk.v, a: power() }; // sin x
    }
    if (tk.t === '(') { const a = expr(); eat(')'); return { paren: a }; }
    throw new Error(`Unexpected "${tk.t}"`);
  }

  const tree = expr();
  if (i < toks.length) throw new Error(`Unexpected "${toks[i].t}"`);
  return tree;
}

export function evaluate(n, x) {
  if ('num' in n) return n.num;
  if (n.x) return x;
  if (n.c) return CONSTS[n.c];
  if (n.paren) return evaluate(n.paren, x);
  if (n.fn) return FUNCS[n.fn](evaluate(n.a, x));
  const a = evaluate(n.a, x);
  switch (n.op) {
    case 'neg': return -a;
    case '+': return a + evaluate(n.b, x);
    case '-': return a - evaluate(n.b, x);
    case '*': return a * evaluate(n.b, x);
    case '/': return a / evaluate(n.b, x);
    case '^': return a ** evaluate(n.b, x);
  }
  return NaN;
}

/** Typst math for a parsed term (built from the tree, never from raw input). */
export function toMath(n, lang = 'de') {
  const numStr = (v) => String(v).replace('.', lang === 'de' ? ',' : '.');
  const startsWithDigit = (m) => /^\d/.test(m);
  const go = (n) => {
    if ('num' in n) return numStr(n.num);
    if (n.x) return 'x';
    if (n.c) return n.c === 'pi' ? 'pi' : 'e';
    if (n.paren) return `(${go(n.paren)})`;
    if (n.fn) {
      const name = { log: 'log', lg: 'lg' }[n.fn] || n.fn;
      const inner = n.a.paren ? go(n.a.paren) : go(n.a);
      return `${name}(${inner})`;
    }
    switch (n.op) {
      case 'neg': return `-${go(n.a)}`;
      case '+': return `${go(n.a)} + ${go(n.b)}`;
      case '-': return `${go(n.a)} - ${go(n.b)}`;
      case '*': {
        const a = go(n.a);
        const b = go(n.b);
        return startsWithDigit(b) || !n.implicit ? `${a} dot ${b}` : `${a} ${b}`;
      }
      case '/': {
        const a = n.a.paren ? go(n.a.paren) : go(n.a);
        const b = n.b.paren ? go(n.b.paren) : go(n.b);
        return `(${a})/(${b})`;
      }
      case '^': return `${go(n.a)}^(${n.b.paren ? go(n.b.paren) : go(n.b)})`;
    }
    return '';
  };
  return go(n);
}

/** "f(x) = x^2" or "x^2" -> { name, tree } (throws on a bad term). */
export function parseFunction(line, fallbackName) {
  const m = String(line).match(/^\s*([a-zA-Z])\s*\(\s*x\s*\)\s*=\s*(.+)$/) || String(line).match(/^\s*y\s*=\s*(.+)$/);
  if (m && m.length === 3) return { name: m[1], term: m[2], tree: parse(m[2]) };
  if (m) return { name: 'y', term: m[1], tree: parse(m[1]), isY: true };
  return { name: fallbackName, term: line, tree: parse(line) };
}

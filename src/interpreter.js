/** Deliberately bounded teaching subset, NOT a complete Python implementation.
 * No eval/Function, DOM, network, imports or arbitrary execution.
 * Each printed value carries the operations that actually produced it. */
export class MiniPythonError extends Error {
  constructor(message, line = 1) { super(message); this.name = 'MiniPythonError'; this.line = line; }
}
export function executeMiniPython(source) {
  if (typeof source !== 'string') throw new MiniPythonError('Программа должна быть текстом.');
  if (source.length > 4000) throw new MiniPythonError('Пока не больше 4000 символов.');
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length > 25) throw new MiniPythonError('Пока не больше 25 строк.');
  const variables = new Map(), printed = []; let statements = 0, operationId = 0;
  lines.forEach((line, index) => {
    const fail = message => { throw new MiniPythonError(message, index + 1); };
    const tokens = []; let i = 0;
    while (i < line.length) {
      const c = line[i];
      if (/\s/u.test(c)) { i++; continue; }
      if (c === '#') break;
      if (c === '"' || c === "'") {
        let text = '', closed = false; i++;
        while (i < line.length) {
          const d = line[i++];
          if (d === c) { closed = true; break; }
          if (d === '\\') {
            const next = line[i++];
            if (next === undefined) fail('После обратного слэша нужен символ.');
            const escapes = { n:'\n', t:'\t', '\\':'\\', '"':'"', "'":"'" };
            text += Object.hasOwn(escapes, next) ? escapes[next] : '\\' + next;
          } else text += d;
        }
        if (!closed) fail('Не хватает закрывающей кавычки. Например: print("Привет").');
        tokens.push({ type:'value', value:text });
      } else {
        const number = line.slice(i).match(/^\d+(?:\.\d+)?/u);
        const name = line.slice(i).match(/^[\p{L}_][\p{L}\p{N}_]*/u);
        if (number) { tokens.push({ type:'value', value:Number(number[0]) }); i += number[0].length; }
        else if (name) { tokens.push({ type:'name', value:name[0] }); i += name[0].length; }
        else if ('+-*/()='.includes(c)) { tokens.push({ type:c, value:c }); i++; }
        else fail('Символ «' + c + '» пока не поддерживается. Попробуй число, +, - или print().');
      }
      if (tokens.length > 200) fail('Команда слишком длинная. Раздели её на короткие строки.');
    }
    if (!tokens.length) return;
    let position = 0, depth = 0;
    const current = () => tokens[position];
    const read = type => current()?.type === type ? tokens[position++] : null;
    const requireToken = (type, message) => read(type) || fail(message);
    const make = (value, operations = new Map()) => {
      if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > 1e12)) fail('Число слишком большое для тренажёра.');
      if (typeof value === 'string' && value.length > 4096) fail('Текст слишком длинный для тренажёра.');
      return { value, operations };
    };
    function atom() {
      if (++depth > 40) fail('Слишком много вложенных скобок или знаков.');
      try {
        const unary = read('+') || read('-');
        if (unary) { const a = atom(); if (typeof a.value !== 'number') fail('Этот знак нужен перед числом.'); return make(unary.type === '-' ? -a.value : a.value, a.operations); }
        const value = read('value'); if (value) return make(value.value);
        const name = read('name');
        if (name) {
          if (!variables.has(name.value)) fail('«' + name.value + '» пока не задано. Слово возьми в кавычки, а переменной сначала дай значение.');
          return variables.get(name.value);
        }
        if (read('(')) { const a = expression(); requireToken(')', 'Не хватает закрывающей скобки ).'); return a; }
        fail('Здесь нужно число, текст в кавычках или имя переменной.');
      } finally { depth--; }
    }
    function combine(left, operator, right) {
      const a = left.value, b = right.value;
      let value;
      if (typeof a === 'string' && typeof b === 'string' && operator === '+') value = a + b;
      else {
        if (typeof a !== 'number' || typeof b !== 'number') fail('Здесь смешались текст и число. Для вычисления убери кавычки вокруг чисел.');
        if (operator === '/' && b === 0) fail('На ноль делить нельзя.');
        value = operator === '+' ? a + b : operator === '-' ? a - b : operator === '*' ? a * b : a / b;
      }
      const operations = new Map([...left.operations, ...right.operations]);
      operations.set(++operationId, { operator, left:a, right:b, result:value });
      return make(value, operations);
    }
    function product() { let a = atom(); while (['*','/'].includes(current()?.type)) { const op = tokens[position++].type; a = combine(a, op, atom()); } return a; }
    function expression() { let a = product(); while (['+','-'].includes(current()?.type)) { const op = tokens[position++].type; a = combine(a, op, product()); } return a; }
    const name = requireToken('name', 'Начни с print( ) или с имени: яблоки = 5.');
    if (name.value === 'print') {
      requireToken('(', 'После print нужны скобки: print(5).');
      const result = current()?.type === ')' ? make('') : expression();
      requireToken(')', 'Не хватает закрывающей скобки ) после print.');
      printed.push({ value:result.value, operations:[...result.operations.values()] });
    } else {
      requireToken('=', 'Для сохранения значения напиши, например: яблоки = 5.');
      variables.set(name.value, expression());
    }
    if (current()) fail('После команды осталось «' + current().value + '». Проверь запись.');
    statements++;
  });
  const output = printed.map(p => String(p.value));
  return { output:output.join('\n'), lines:output, statements, printed };
}

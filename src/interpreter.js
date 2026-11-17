/**
 * АГА! Mini Python — a deliberately small, local teaching interpreter.
 * Supports: print(expression), Unicode-named variables, numbers, strings,
 * parentheses, + - * /, unary +/-, and comments.
 * It NEVER evaluates JavaScript or loads Python from a remote server.
 * This is NOT a complete Python interpreter.
 */

export class MiniPythonError extends Error {
  constructor(message, line = 1) {
    super(message);
    this.name = "MiniPythonError";
    this.line = line;
  }
}

const MAX_LINES = 25;
const MAX_SOURCE_LENGTH = 4000;
const MAX_TOKENS = 200;
const isNameStart = (char) => /^[\p{L}_]$/u.test(char);
const isNamePart = (char) => /^[\p{L}\p{N}_]$/u.test(char);
const isDigit = (char) => /^[0-9]$/.test(char);

function lex(input, line) {
  const chars = [...input];
  const tokens = [];
  let i = 0;
  const fail = (message) => { throw new MiniPythonError(message, line); };

  while (i < chars.length) {
    const char = chars[i];
    if (/\s/u.test(char)) { i++; continue; }
    if (char === "#") break;

    if (char === '"' || char === "'") {
      const quote = char;
      let value = "";
      let finished = false;
      i++;
      while (i < chars.length) {
        const next = chars[i++];
        if (next === quote) { finished = true; break; }
        if (next === "\\") {
          const escaped = chars[i++];
          if (escaped === undefined) fail("После обратного слэша нужен символ.");
          const replacements = { n: "\n", t: "\t", "\\": "\\", '"': '"', "'": "'" };
          value += Object.hasOwn(replacements, escaped) ? replacements[escaped] : "\\" + escaped;
        } else {
          value += next;
        }
      }
      if (!finished) fail('Кажется, потерялась закрывающая кавычка. Попробуй: print("Привет")');
      tokens.push({ type: "string", value });
    } else if (isDigit(char)) {
      let raw = "";
      while (i < chars.length && isDigit(chars[i])) raw += chars[i++];
      if (chars[i] === "." && isDigit(chars[i + 1] ?? "")) {
        raw += chars[i++];
        while (i < chars.length && isDigit(chars[i])) raw += chars[i++];
      }
      tokens.push({ type: "number", value: Number(raw) });
    } else if (isNameStart(char)) {
      let name = "";
      while (i < chars.length && isNamePart(chars[i])) name += chars[i++];
      tokens.push({ type: "name", value: name });
    } else if ("+-*/()=".includes(char)) {
      tokens.push({ type: char, value: char });
      i++;
    } else if (char === ",") {
      fail('В этом первом тренажёре print() показывает одно значение. Например: print(5 + 3)');
    } else {
      fail("Символ «" + char + "» пока незнаком тренажёру. Для начала попробуй цифры, + и print().");
    }

    if (tokens.length > MAX_TOKENS) fail("Слишком длинная команда для первого урока. Раздели её на части.");
  }
  return tokens;
}

class Parser {
  constructor(tokens, variables, line) {
    this.tokens = tokens;
    this.variables = variables;
    this.line = line;
    this.position = 0;
    this.depth = 0;
  }

  current() { return this.tokens[this.position]; }
  read(type) {
    if (this.current()?.type === type) {
      return this.tokens[this.position++];
    }
    return null;
  }
  require(type, message) {
    const token = this.read(type);
    if (!token) throw new MiniPythonError(message, this.line);
    return token;
  }
  end() {
    if (this.current()) {
      const token = this.current();
      throw new MiniPythonError("После команды осталось «" + token.value + "». Проверь скобки и знаки.", this.line);
    }
  }

  parseExpression() { return this.parseSum(); }

  parseSum() {
    let value = this.parseProduct();
    while (this.current()?.type === "+" || this.current()?.type === "-") {
      const operator = this.tokens[this.position++].type;
      const right = this.parseProduct();
      if (operator === "+" && typeof value === "string" && typeof right === "string") {
        value += right;
      } else if (typeof value === "number" && typeof right === "number") {
        value = operator === "+" ? value + right : value - right;
      } else {
        throw new MiniPythonError("Здесь смешались текст и число. В первом уроке складывай числа с числами.", this.line);
      }
      this.safeNumber(value);
    }
    return value;
  }

  parseProduct() {
    let value = this.parseUnary();
    while (this.current()?.type === "*" || this.current()?.type === "/") {
      const operator = this.tokens[this.position++].type;
      const right = this.parseUnary();
      if (typeof value !== "number" || typeof right !== "number") {
        throw new MiniPythonError("Умножать и делить здесь можно только числа.", this.line);
      }
      if (operator === "/" && right === 0) {
        throw new MiniPythonError("На ноль делить нельзя. Попробуй другое число.", this.line);
      }
      value = operator === "*" ? value * right : value / right;
      this.safeNumber(value);
    }
    return value;
  }

  parseUnary() {
    if (this.read("+")) {
      const value = this.parseUnary();
      if (typeof value !== "number") throw new MiniPythonError("Знак + перед числом работает только с числами.", this.line);
      return value;
    }
    if (this.read("-")) {
      const value = this.parseUnary();
      if (typeof value !== "number") throw new MiniPythonError("Знак − перед числом работает только с числами.", this.line);
      return -value;
    }
    return this.parseAtom();
  }

  parseAtom() {
    this.depth++;
    if (this.depth > 40) throw new MiniPythonError("Очень много скобок. Начни с одной пары: print(4 + 3)", this.line);
    try {
      const token = this.current();
      if (!token) throw new MiniPythonError("Здесь не хватает числа, текста или имени переменной.", this.line);
      if (token.type === "number" || token.type === "string") {
        this.position++;
        this.safeNumber(token.value);
        return token.value;
      }
      if (token.type === "name") {
        this.position++;
        if (this.variables.has(token.value)) return this.variables.get(token.value);
        throw new MiniPythonError("«" + token.value + "» пока не задано. Если это слово, возьми его в кавычки. Если переменная — сначала дай ей значение.", this.line);
      }
      if (this.read("(")) {
        const result = this.parseExpression();
        this.require(")", "Похоже, не хватает закрывающей скобки ).");
        return result;
      }
      throw new MiniPythonError("Здесь ожидалось число, слово в кавычках или переменная, но встретилось «" + token.value + "».", this.line);
    } finally {
      this.depth--;
    }
  }

  safeNumber(value) {
    if (typeof value === "number" && (!Number.isFinite(value) || Math.abs(value) > 1e12)) {
      throw new MiniPythonError("Число получилось слишком большим для этого тренажёра.", this.line);
    }
  }
}

export function executeMiniPython(source) {
  if (typeof source !== "string") throw new MiniPythonError("Программа должна быть текстом.");
  if (source.length > MAX_SOURCE_LENGTH) throw new MiniPythonError("Для первого урока хватит короткой программы — до 4000 символов.");
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  if (lines.length > MAX_LINES) throw new MiniPythonError("Пока тренируем короткие программы: не больше 25 строк.");

  const variables = new Map();
  const output = [];
  let statements = 0;

  for (let index = 0; index < lines.length; index++) {
    const lineNumber = index + 1;
    const tokens = lex(lines[index], lineNumber);
    if (tokens.length === 0) continue;
    const parser = new Parser(tokens, variables, lineNumber);
    const first = parser.read("name");
    if (!first) throw new MiniPythonError("Начни с команды print( ) или с имени переменной, например: яблоки = 5", lineNumber);

    if (first.value === "print") {
      parser.require("(", 'Для print нужны скобки. Например: print("Привет, мир!")');
      const value = parser.current()?.type === ")" ? "" : parser.parseExpression();
      parser.require(")", "Кажется, не хватает закрывающей скобки ) после print.");
      parser.end();
      output.push(String(value));
    } else {
      parser.require("=", "Если хочешь сохранить число, напиши " + first.value + " = 5. Для вывода используй print( ).");
      const value = parser.parseExpression();
      parser.end();
      variables.set(first.value, value);
    }
    statements++;
  }

  return { output: output.join("\n"), lines: output, statements };
}
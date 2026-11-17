import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { executeMiniPython, MiniPythonError } from "../src/interpreter.js";

const run = (program) => executeMiniPython(program).output;

test("prints a friendly first message", () => {
  assert.equal(run('print("Привет, мир!")'), "Привет, мир!");
});

test("can solve the apple-box example using a Unicode variable", () => {
  assert.equal(run("яблоки = 5\nprint(яблоки + 3)"), "8");
});

test("handles parentheses and arithmetic precedence", () => {
  assert.equal(run("print(2 + 3 * 4)"), "14");
  assert.equal(run("print((2 + 3) * 4)"), "20");
  assert.equal(run("print(-9 / 3 + 5)"), "2");
});

test("supports single quotes, string joining, blank print, and comments", () => {
  assert.equal(run("print('А' + 'Б') # two letters\nprint()"), "АБ\n");
  assert.equal(run('print("решётка # внутри строки")'), "решётка # внутри строки");
});

test("gives a human-readable error with the correct line number", () => {
  assert.throws(
    () => run('print(3)\nprint("потерянная кавычка)'),
    (error) => error instanceof MiniPythonError && error.line === 2 && /кавычк/u.test(error.message)
  );
});

test("detects unknown names and teaches when to use quotes", () => {
  assert.throws(() => run("print(hello)"), /кавычки/u);
});

test("forbids division by zero", () => {
  assert.throws(() => run("print(5 / 0)"), /ноль/u);
});

test("forbids JavaScript, loops, imports, and function calls", () => {
  for (const code of [
    "alert(1)",
    "import os",
    "while True: print(1)",
    "print(window.location)",
    "print(1); alert(2)",
    "print(eval(123))"
  ]) {
    assert.throws(() => run(code), MiniPythonError, code);
  }
});

test("limits the size and the number of lines", () => {
  assert.throws(() => run("p".repeat(4001)), /4000/u);
  assert.throws(() => run("\n".repeat(25)), /25/u);
});

test("only explicit print statements generate output", () => {
  assert.equal(run("яблоки = 5"), "");
  assert.equal(run("print()"), "");
  assert.equal(executeMiniPython("яблоки = 5").lines.length, 0);
  assert.equal(executeMiniPython("print()").lines.length, 1);
});

test("page includes required learning sections and local assets", () => {
  const root = new URL("../", import.meta.url);
  const html = readFileSync(new URL("index.html", root), "utf8");
  for (const id of ["intro", "math", "language", "code", "code-editor", "code-output", "math-feedback", "progress-bar"]) {
    assert.ok(html.includes('id="' + id + '"'), "Missing id: " + id);
  }
  for (const asset of ["styles/main.css", "src/app.js", "assets/mark.svg", "assets/mascot.svg", "assets/hero-lab.svg", "assets/badge.png"]) {
    assert.ok(existsSync(new URL(asset, root)), "Missing asset: " + asset);
  }
  assert.ok(!html.includes("https://cdn."), "First lesson should not depend on a CDN");
});
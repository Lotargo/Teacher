import { executeMiniPython, MiniPythonError } from "./interpreter.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const STORAGE_KEY = "aga-lesson-01-progress-v1";
const lessonSteps = ["math", "language", "code"];
const examples = Object.freeze({
  hello: 'print("Привет, мир!")',
  sum: "print(5 + 3)",
  box: "яблоки = 5\nprint(яблоки + 3)"
});

let guess = 0;
let currentExample = "hello";
let savedProgress = loadProgress();
let toastTimeout = null;

function loadProgress() {
  try {
    const json = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      math: json.math === true,
      language: json.language === true,
      code: json.code === true
    };
  } catch {
    return { math: false, language: false, code: false };
  }
}

function persist() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(savedProgress)); }
  catch { /* Private browsing or unavailable local storage: lesson still works. */ }
}

function setFeedback(selector, message, kind = "") {
  const element = $(selector);
  element.textContent = message;
  element.classList.remove("success", "error");
  if (kind) element.classList.add(kind);
}

function showToast(message) {
  const toast = $("#toast");
  $("#toast-text").textContent = message;
  toast.hidden = false;
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { toast.hidden = true; }, 4200);
}

function celebrate(element) {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const rect = element.getBoundingClientRect();
  const x = Math.max(30, Math.min(window.innerWidth - 30, rect.left + rect.width / 2));
  const y = Math.max(30, Math.min(window.innerHeight - 30, rect.top + rect.height / 2));
  const colors = ["#d8ef74", "#ff9589", "#c7bcff", "#8fd7bd", "#f8d07c"];
  const layer = $("#confetti-layer");
  for (let i = 0; i < 22; i++) {
    const piece = document.createElement("span");
    piece.className = "confetti-piece";
    piece.style.left = x + "px";
    piece.style.top = y + "px";
    piece.style.backgroundColor = colors[i % colors.length];
    piece.style.setProperty("--dx", ((Math.random() - .5) * 420) + "px");
    piece.style.setProperty("--dy", (70 + Math.random() * 290) + "px");
    piece.style.setProperty("--rot", (Math.random() * 820 - 410) + "deg");
    piece.style.animationDelay = (Math.random() * .15) + "s";
    layer.appendChild(piece);
    setTimeout(() => piece.remove(), 1550);
  }
}

function renderProgress() {
  const done = lessonSteps.filter((step) => savedProgress[step]).length;
  $("#header-progress").textContent = done + " из 3 открытий";
  $("#progress-count").textContent = done + " из 3 открытий";
  $("#progress-fill").style.width = (done * 100 / 3) + "%";
  $("#progress-bar").setAttribute("aria-valuenow", String(done));

  for (const step of lessonSteps) {
    const badge = $("#" + step + "-checkpoint");
    badge.classList.toggle("is-done", savedProgress[step]);
    badge.querySelector(".checkpoint__icon").textContent = savedProgress[step] ? "✓" : "○";
  }

  if (done === 3) {
    $("#finish-heading").textContent = "Ты сделал три открытия! ✨";
    $("#finish-text").textContent = "Ты разобрал историю, записал неизвестное и заставил компьютер проверить расчёт. Это не магия и не зубрёжка — это понимание, которое ты построил сам.";
  } else if (done > 0) {
    $("#finish-heading").textContent = "Вот оно: первое «ага!»";
    $("#finish-text").textContent = "У тебя уже " + done + " из 3 открытий. Не спеши. Следующий шаг можно пройти сейчас или вернуться к нему позже.";
  } else {
    $("#finish-heading").textContent = "Не нужно понимать всё сразу.";
    $("#finish-text").textContent = "Одно понятное действие важнее десяти непонятных лекций. Можно вернуться к любому шагу и попробовать снова.";
  }
}

function completeStep(step, message, trigger) {
  if (!savedProgress[step]) {
    savedProgress[step] = true;
    persist();
    renderProgress();
    celebrate(trigger);
    showToast(message);
  }
}

function renderGuess() {
  $("#guess-value").textContent = String(guess);
  $("#guess-preview").textContent = guess === 0 ? "0" : String(guess);
  $("#basket-apples").textContent = "🍎".repeat(guess);
  $("#guess-minus").disabled = guess <= 0;
  $("#guess-plus").disabled = guess >= 12;
}

$("#guess-minus").addEventListener("click", () => {
  guess = Math.max(0, guess - 1);
  renderGuess();
});
$("#guess-plus").addEventListener("click", () => {
  guess = Math.min(12, guess + 1);
  renderGuess();
});
$("#check-math").addEventListener("click", (event) => {
  const total = guess + 3;
  if (total === 8) {
    setFeedback("#math-feedback", "Точно! Было 5, добавили 3 — стало 8. Ты нашёл ответ без формулы.", "success");
    completeStep("math", "Первое открытие! Ты нашёл неизвестное.", event.currentTarget);
  } else {
    const direction = total < 8 ? "Попробуй немного больше." : "Попробуй немного меньше.";
    setFeedback("#math-feedback", "Сейчас выходит " + total + ", а нужно 8. " + direction, "error");
  }
});

$$("[data-answer]").forEach((button) => {
  button.addEventListener("click", (event) => {
    const correct = button.dataset.answer === "unknown";
    $$("[data-answer]").forEach((item) => item.classList.remove("selected", "is-correct", "is-wrong"));
    button.classList.add(correct ? "is-correct" : "is-wrong");
    button.classList.add("selected");
    if (correct) {
      setFeedback("#language-feedback", "Верно! x — просто название пока неизвестного числа. В нашей истории x = 5.", "success");
      completeStep("language", "Второе открытие! Буква x больше не загадка.", event.currentTarget);
    } else {
      setFeedback("#language-feedback", "Не совсем. Вспомни коробку: мы дали имя тому количеству, которого ещё не знаем.", "error");
    }
  });
});

const codeEditor = $("#code-editor");
let lastExecution = null;

function renderLineNumbers() {
  const lines = codeEditor.value.split("\n").length;
  $("#line-numbers").textContent = Array.from({ length: lines }, (_, i) => i + 1).join("\n");
}

function clearOutput() {
  $("#code-output").classList.remove("is-error");
  $("#code-output").textContent = "Нажми «Запустить» — здесь появится результат.";
  lastExecution = null;
}

function chooseExample(key) {
  if (!Object.hasOwn(examples, key)) return;
  currentExample = key;
  codeEditor.value = examples[key];
  renderLineNumbers();
  clearOutput();
  $$("[data-example]").forEach((button) => {
    const active = button.dataset.example === key;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

$$("[data-example]").forEach((button) => button.addEventListener("click", () => chooseExample(button.dataset.example)));
$("#restore-example").addEventListener("click", () => chooseExample(currentExample));
$("#clear-output").addEventListener("click", clearOutput);

codeEditor.addEventListener("input", () => {
  lastExecution = null;
  renderLineNumbers();
});

codeEditor.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    runCode();
  }
  if (event.key === "Tab") {
    event.preventDefault();
    const start = codeEditor.selectionStart;
    const end = codeEditor.selectionEnd;
    codeEditor.setRangeText("  ", start, end, "end");
    lastExecution = null;
    renderLineNumbers();
  }
});

function runCode() {
  try {
    const result = executeMiniPython(codeEditor.value);
    $("#code-output").classList.remove("is-error");
    $("#code-output").textContent = result.lines.length
      ? result.output || "Программа показала пустую строку."
      : "Программа выполнилась, но ничего не вывела. Попробуй добавить print( ).";
    lastExecution = { code: codeEditor.value, result, error: null };
    return lastExecution;
  } catch (error) {
    const message = error instanceof MiniPythonError
      ? "Строка " + error.line + ": " + error.message
      : "Что-то пошло не так в учебном тренажёре. Попробуй начать с готового примера.";
    $("#code-output").classList.add("is-error");
    $("#code-output").textContent = "Не получилось с первого раза — это нормально.\n\n" + message;
    lastExecution = { code: codeEditor.value, result: null, error };
    return lastExecution;
  }
}

$("#run-code").addEventListener("click", runCode);

$("#toggle-hint").addEventListener("click", () => {
  const hint = $("#code-hint");
  hint.hidden = !hint.hidden;
  $("#toggle-hint").setAttribute("aria-expanded", String(!hint.hidden));
  $("#toggle-hint").textContent = hint.hidden ? "Хочу маленькую подсказку ↓" : "Спрятать подсказку ↑";
});

$("#check-code").addEventListener("click", (event) => {
  const execution = lastExecution?.code === codeEditor.value ? lastExecution : runCode();
  if (execution.error) {
    setFeedback("#code-feedback", "Код пока не запускается. Посмотри подсказку в окне результата и попробуй исправить.", "error");
    return;
  }

  const output = execution.result.lines.map((line) => line.trim());
  const containsSum = /(?:4\s*\+\s*3|3\s*\+\s*4)/u.test(execution.code);
  if (output.includes("7") && containsSum) {
    setFeedback("#code-feedback", "Есть! Ты сам записал вычисление и запустил его. Это твоя первая программа.", "success");
    completeStep("code", "Третье открытие! Код выполнил твою мысль.", event.currentTarget);
  } else if (output.includes("7")) {
    setFeedback("#code-feedback", "7 получилось! А теперь попроси компьютер сложить 4 + 3, а не показывать готовый ответ.", "error");
  } else {
    setFeedback("#code-feedback", "Нам нужно получить 7 через сложение 4 и 3. Выбери пример «Сложение», поменяй числа и попробуй снова.", "error");
  }
});

$("#reset-progress").addEventListener("click", () => {
  savedProgress = { math: false, language: false, code: false };
  persist();
  guess = 0;
  renderGuess();
  renderProgress();
  chooseExample("hello");
  for (const step of ["math", "language", "code"]) {
    setFeedback("#" + step + "-feedback", {
      math: "Не бойся ошибиться. Проверка здесь важнее угадывания.",
      language: "Выбери ответ. У тебя нет лимита попыток.",
      code: "Здесь важно действие, а не скорость."
    }[step]);
  }
  $$("[data-answer]").forEach((button) => button.classList.remove("selected", "is-correct", "is-wrong"));
  $("#code-hint").hidden = true;
  $("#toggle-hint").setAttribute("aria-expanded", "false");
  $("#toggle-hint").textContent = "Хочу маленькую подсказку ↓";
  showToast("Отметки обнулены. Можно пройти историю ещё раз.");
  $("#intro").scrollIntoView({ behavior: "smooth", block: "start" });
});

const sectionLinks = $$(".lesson-nav__link");
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
    if (!visible.length) return;
    const active = visible[0].target.id;
    for (const link of sectionLinks) {
      const match = link.getAttribute("href") === "#" + active;
      link.classList.toggle("active", match);
      if (match) link.setAttribute("aria-current", "location");
      else link.removeAttribute("aria-current");
    }
  }, { rootMargin: "-15% 0px -65% 0px", threshold: [0, .15, .5] });
  ["intro", "math", "language", "code"].forEach((id) => observer.observe($("#" + id)));
}

renderGuess();
renderProgress();
renderLineNumbers();
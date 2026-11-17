export const FIELD_LIMITS = Object.freeze({ idea:400, audience:300, first:500, check:500 });
export function workshopPrompt(fields) {
  for (const [key, limit] of Object.entries(FIELD_LIMITS)) {
    if (typeof fields?.[key] !== 'string' || !fields[key].trim() || fields[key].length > limit) throw new Error('Заполни все четыре поля, не превышая указанную длину.');
  }
  return [
    'Помоги превратить мою идею в понятное задание для первого прототипа. Ниже мои ответы из мастерской:', '',
    'ИДЕЯ: ' + fields.idea.trim(),
    'ДЛЯ КОГО: ' + fields.audience.trim(),
    'ПЕРВАЯ ВЕРСИЯ: ' + fields.first.trim(),
    'ПРОВЕРКА РЕЗУЛЬТАТА: ' + fields.check.trim(), '',
    'Составь конкретное задание именно по этим ответам: цель, что делаем в первой версии, короткий план и проверка результата. Не добавляй функции и технологии без причины. Отметь недостающие сведения как вопросы, не выдумывай ответы. Не меняй мои ограничения. Объясняй просто, без жаргона. До 300 слов, без вступления о сайте и без рекламы.'
  ].join('\n');
}
export function askWorkshopPixie(prompt, onDelta) {
  return new Promise((resolve, reject) => {
    const event = new CustomEvent('aga:workshop-help', {cancelable:true, detail:{prompt,onDelta,resolve,reject}});
    if (window.dispatchEvent(event)) reject(new Error('chat-not-ready'));
  });
}

export const ERROR_TEXT = Object.freeze({
  blocked: 'На этот запрос я не могу ответить: сработало ограничение безопасности. Можем обсудить тему в безопасных общих чертах.',
  unavailable: 'Сейчас у меня не получается получить ответ. Это временный сбой, а не ошибка в твоём вопросе. Сообщение осталось в поле ввода — попробуй ещё раз немного позже.',
  network: 'Кажется, соединение прервалось. Проверь интернет и повтори отправку. Твоё сообщение осталось в поле ввода.',
  timeout: 'Ответ задержался дольше обычного. Попробуй ещё раз чуть позже; сообщение осталось в поле ввода.',
  verification: 'Не удалось подтвердить подключение. Обнови страницу и попробуй ещё раз. Если мешает блокировщик, разреши проверку для этого сайта.',
  rate_limit: 'Сейчас поступило слишком много сообщений. Дай мне минутку и попробуй ещё раз.',
  quota: 'Общий лимит ответов на сегодня закончился. Попробуй позже: он обновляется автоматически. Уроки и материалы сайта доступны как обычно.',
  busy: 'Я ещё отвечаю на предыдущее сообщение. Дождись ответа или нажми «Стоп».',
  too_long: 'Сообщение получилось слишком большим. Сократи его или начни новый диалог.',
  interrupted: 'Ответ оборвался по пути. Я не буду выдавать незаконченный текст за готовый — попробуй отправить вопрос ещё раз.'
});
export class PixieError extends Error {
  constructor(code = 'unavailable') {
    super(ERROR_TEXT[code] || ERROR_TEXT.unavailable);
    this.name = 'PixieError';
    this.code = Object.hasOwn(ERROR_TEXT, code) ? code : 'unavailable';
  }
}
export function friendlyError(error) {
  return error instanceof PixieError ? ERROR_TEXT[error.code] : ERROR_TEXT.unavailable;
}
/** Only explicit policy signals are considered a refusal. An unavailable safety
 * service, a generic 403, or a network failure is not a user's policy violation. */
export function classifyFailure(error) {
  const code = String(error?.code ?? error?.error?.code ?? '');
  if (Object.hasOwn(ERROR_TEXT, code)) return code;
  const message = [code, error?.message, typeof error?.error === 'string' ? error.error : error?.error?.message].filter(x => typeof x === 'string').join(' ').toLowerCase();
  if (/safety.{0,30}(unavailable|timeout|failed|error)/.test(message)) return 'unavailable';
  if (/content[_ -]filter|content_policy_violation|safety[_ -]blocked|moderation[_ -]blocked|blocked by.{0,20}(safety|policy)/.test(message)) return 'blocked';
  if (/\b3036\b/.test(message)) return 'quota';
  if (/\b3040\b|out of capacity|capacity temporarily/.test(message)) return 'unavailable';
  if (/\b3007\b|timed? ?out|timeout/.test(message)) return 'timeout';
  return 'unavailable';
}
export function isRefusal(packet) {
  const choice = packet?.choices?.[0];
  return choice?.finish_reason === 'content_filter'
    || Boolean(choice?.message?.refusal || choice?.delta?.refusal);
}

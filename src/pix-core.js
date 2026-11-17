/** Small static knowledge base for Pix. No AI or network is required. */
export const PATHS = Object.freeze({
  home: { label: 'Главная', path: './' },
  catalog: { label: 'Практика', path: 'courses/' },
  start: { label: 'Знакомство', path: 'courses/start/' },
  lesson: { label: 'Первое занятие', path: 'lessons/first-discovery/' },
  math: { label: 'Математика для жизни', path: 'math/' },
  workshop: { label: 'Мастерская идей', path: 'workshop/' },
  library: { label: 'Библиотека', path: 'library/' },
  article: { label: 'Проверка работы ИИ', path: 'library/check-ai/' },
  faq: { label: 'Вопросы и ответы', path: 'faq/' },
});

export function getPageContext(page = 'home') {
  const route = Object.hasOwn(PATHS, page) ? page : 'home';
  const context = {
    home: 'Главная АГА!: здесь выбирают направления по интересу, а не профессию.',
    catalog: 'Практика: небольшие интерактивные задачи без предварительных знаний.',
    start: 'Знакомство: семь маленьких открытий от яблок до первой программы.',
    lesson: 'Занятие «От догадки к проверке»: яблоки, сложение, неизвестное, первые команды и перенос понимания.',
    math: 'Математика для жизни: проценты, скидки, количество материала и время.',
    workshop: 'Мастерская идей: составить понятное задание для собственного проекта.',
    library: 'Библиотека АГА!: статьи и тщательно отобранные внешние ресурсы.',
    article: 'Статья о проверке проектов, сгенерированных ИИ.',
    faq: 'Вопросы и ответы об АГА!, Пикс и добровольном Puter.js.',
  };
  return { route, label: PATHS[route].label, description: context[route] };
}

const LINK = (id) => ({ label: PATHS[id].label, path: PATHS[id].path });
const CARDS = {
  start: {
    label: 'С чего начать?', state: 'guide',
    text: 'С самого начала! Попробуй короткое знакомство: сначала обычная ситуация с яблоками, затем математическая запись и код. Ничего знать заранее не нужно.',
    links: [LINK('start'), LINK('lesson')],
  },
  how: {
    label: 'Что здесь есть?', state: 'hello',
    text: 'В АГА! можно практиковаться, считать бытовые задачи, составлять задания для своего проекта и читать статьи. Учиться программировать ради диплома совсем не обязательно.',
    links: [LINK('catalog'), LINK('math'), LINK('workshop'), LINK('library')],
  },
  math: {
    label: 'Как понять проценты?', state: 'thinking',
    text: 'Представь сотню одинаковых деталей. Скидка 20% означает, что из каждых ста рублей убирают двадцать. Попробуй поменять цену и процент в калькуляторе — увидишь, что происходит.',
    links: [LINK('math')],
  },
  lesson: {
    label: 'Я застрял в задании', state: 'thinking',
    text: 'Начни не с формулы: что было, что добавили или убрали и что нужно найти? Если известно, сколько стало, можно мысленно отменить последнее действие. Нажми «Подсказка» в самом задании — она раскроется постепенно.',
    links: [LINK('lesson')],
  },
  code: {
    label: 'Не понимаю код', state: 'guide',
    text: 'Команда print() означает «покажи результат на экране». Разница важна: print(5 + 3) вычисляет сумму, а print("5 + 3") выводит только текст. Открой редактор в знакомстве и попробуй оба варианта.',
    links: [LINK('lesson')],
  },
  idea: {
    label: 'У меня идея', state: 'idea',
    text: 'Для начала не выбирай язык программирования. Опиши, что хочешь сделать, кому это нужно, что должно работать в первой версии и как ты это проверишь. В мастерской есть конструктор такого задания.',
    links: [LINK('workshop')],
  },
  check: {
    label: 'Как проверить ИИ?', state: 'guide',
    text: 'Программа может запускаться и всё равно решать не ту задачу. Сравни результат с целью, попробуй неудобные сценарии, спроси о рисках и способе отката. Мы разобрали это на примере сайта для заказов.',
    links: [LINK('article')],
  },
  puter: {
    label: 'Как работает ИИ?', state: 'guide',
    text: 'Сейчас я подсказываю по самому сайту, без сети и без аккаунта. ИИ через Puter — отдельная добровольная функция. Перед включением покажем, какие данные отправляются, кому и за чей счёт.',
    links: [LINK('faq')],
  },
};

export function getSuggestions(page = 'home') {
  const pairs = {
    lesson: ['lesson','code','math'], start: ['start','lesson','puter'],
    math: ['math','lesson','idea'], workshop: ['idea','check','puter'],
    library: ['check','math','idea'], article: ['check','idea','puter'],
    faq: ['puter','how','start'], catalog: ['start','how','idea'],
    home: ['start','how','idea'],
  };
  return (pairs[page] || pairs.home).map(id => ({ id, label: CARDS[id].label }));
}

export function getLocalAnswer(id) {
  const card = CARDS[id] || CARDS.how;
  return { text: card.text, state: card.state, links: card.links };
}

export function guessLocalIntent(text, page = 'home') {
  const q = String(text || '').toLowerCase().slice(0, 1200);
  if (/процент|скид|цен[ау]|рубл|смет|рассчит/.test(q)) return 'math';
  if (/код|print|python|пайтон|скобк|переменн/.test(q)) return 'code';
  if (/провер|ошибк|безопасн|уязвим|иск(усств|у|и)|нейросет/.test(q)) return 'check';
  if (/иде[яию]|сайт|приложен|игр|проект|заработ/.test(q)) return 'idea';
  if (/плат|деньг|путер|puter|квот|логин|вход|приват|данн/.test(q)) return 'puter';
  if (/задани|яблок|понят|подсказ|застр/.test(q)) return 'lesson';
  if (/нача|перв|с нуля/.test(q)) return 'start';
  return page === 'lesson' ? 'lesson' : 'how';
}

export const ASSISTANT_INSTRUCTIONS = `Ты Пикс — доброжелательная и иногда шутливая проводница по образовательной лаборатории «АГА!». Всегда отвечай на русском, кратко, просто, без сюсюканья и без профессионального жаргона. Для пользователя программирование и даже базовая математика могут быть незнакомы. Не предполагай знаний. Сначала используй знакомую бытовую аналогию, затем объясняй точную запись, если это уместно. Помогай самостоятельно проверить гипотезу, не выдавай готовый ответ ученику, когда он просит только подсказку. Не придумывай несуществующие страницы или курсы: сейчас есть знакомство, практическая математика, мастерская и библиотека. Не говори, что можешь изменять файлы, проходить урок за ученика, обращаться к браузеру или проверять настоящий сервер: у тебя нет таких действий. Не утверждай, что код безопасен только потому, что он запустился. Для финансов, здоровья, личных данных и физического оборудования советуй независимую проверку специалистом. Ты — помощница, не экзаменатор и не источник окончательной истины. Без рекламы, платных предложений и агитации за профессию IT.`;

export function buildAiMessages(page, turns, question) {
  const context = getPageContext(page);
  const safeTurns = Array.isArray(turns) ? turns.slice(-8).filter(t =>
    (t?.role === 'user' || t?.role === 'assistant') && typeof t.content === 'string'
  ).map(t => ({ role: t.role, content: t.content.slice(0, 2000) })) : [];
  return [
    { role: 'system', content: ASSISTANT_INSTRUCTIONS + '\nТекущая страница: ' + context.description },
    ...safeTurns,
    { role: 'user', content: String(question || '').slice(0, 1200) },
  ];
}

export function getAiText(response) {
  const content = response?.message?.content ?? response?.text ?? response;
  const answer = typeof content === 'string' ? content
    : Array.isArray(content) ? content.filter(x => x?.type === 'text' && typeof x.text === 'string').map(x => x.text).join('\n')
    : '';
  if (!answer.trim()) throw new Error('Ответ Puter не содержит текста. Попробуй сформулировать вопрос иначе.');
  return answer.slice(0, 6000);
}

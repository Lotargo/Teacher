/** Published routes, not a promised syllabus. Each lesson has its own document. */
import { taskIds } from './lesson-data.js';
export const introLesson = Object.freeze({
  id: 'first-discovery', title: 'От догадки к проверке',
  description: 'Одна история с яблоками: представим действие, запишем его и проверим в коде.',
  href: 'lessons/first-discovery/', storageKey: 'aga-connected-story-v2',
  taskIds: [...taskIds.filter(id => id !== 'transfer'), 'transfer'], sections: { add:'math', undo:'backward', name:'language', show:'code', 'add-code':'code', 'undo-code':'code', transfer:'transfer' }
});
export const learningPaths = Object.freeze([
  { id:'start', kind:'Знакомство', title:'Начнём с любопытства', status:'available', href:'courses/start/',
    description:'Попробуй, как устроена лаборатория. Без подготовки, оценок и спешки.', lessons:[introLesson] },
  { id:'foundations', kind:'Будущий курс', title:'Математика и код с нуля', status:'planned',
    description:'Отдельная последовательная программа. Сейчас готово только знакомство; уроки курса ещё не опубликованы.', lessons:[] }
]);
export function readLessonProgress(lesson, storage) {
  let raw;
  try { raw = JSON.parse((storage ?? globalThis.localStorage).getItem(lesson.storageKey)); } catch { /* Storage is optional. */ }
  const done = Array.isArray(raw?.done) ? [...new Set(raw.done.filter(id => lesson.taskIds.includes(id)))] : [];
  const total = lesson.taskIds.length;
  const next = lesson.taskIds.find(id => !done.includes(id));
  return { done, count:done.length, total, complete:done.length === total, next,
    fragment:done.length === 0 ? '' : next ? '#' + lesson.sections[next] : '#finish' };
}

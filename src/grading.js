/** Grade executed numeric values, never source-text regex matches. */
export function gradeCode(task, execution) {
  if (execution.printed.length !== 1) return { ok:false, message:'Для этой задачи покажи один ответ одной командой print.' };
  const printed = execution.printed[0];
  if (typeof printed.value !== 'number') return { ok:false, message:'Сейчас показан текст. Для вычисления числа и действие внутри print должны быть без кавычек.' };
  if (printed.value !== task.expected) return { ok:false, message: task.id === 'undo-code' ? 'Сейчас получилось ' + printed.value + '. Но мы ищем начало: нужно убрать добавленные три, а не прибавлять их снова.' : 'Сейчас получилось ' + printed.value + '. Вернись к условию: было пять, добавили три. Какое значение нужно показать?' };
  if (task.operation) {
    const [a,b] = task.operands;
    const performed = printed.operations.some(op => op.operator === task.operation && ((op.left === a && op.right === b) || (task.operation === '+' && op.left === b && op.right === a)));
    if (!performed) return { ok:false, message:'Ответ верный, но нам важно получить его нужным действием. Запиши ' + a + ' ' + task.operation + ' ' + b + ' внутри print, а не готовое число.' };
  }
  return { ok:true, message:task.id === 'show' ? 'Команда показала восемь. Теперь научим её не только показывать, но и считать.' : 'Да! Компьютер выполнил именно то действие, которое мы разобрали с яблоками.' };
}

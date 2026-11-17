const form=document.querySelector('#idea-form');
if(form){
 const box=document.querySelector('#idea-output-wrap'),out=document.querySelector('#idea-output');
 const copy=document.querySelector('#copy-idea'),status=document.querySelector('#copy-status');
 form.addEventListener('submit',event=>{
  event.preventDefault();
  if(!form.reportValidity())return;
  const get=id=>document.getElementById(id).value.trim();
  const idea=get('idea-what'),people=get('idea-who'),minimum=get('idea-first'),check=get('idea-check');
  if(!idea||!people||!minimum||!check){status.textContent='Заполни все четыре вопроса своими словами.';return;}
  const task=[
   'Я хочу создать небольшой первый прототип. Помоги разобраться с задачей без лишних технологий.',
   '',
   'ИДЕЯ: '+idea,
   'ДЛЯ КОГО: '+people,
   'ПЕРВАЯ ВЕРСИЯ ДОЛЖНА: '+minimum,
   'КАК Я ПРОВЕРЮ РЕЗУЛЬТАТ: '+check,
   '',
   'Сначала объясни простыми словами, что предлагаешь сделать, какие есть риски и какая информация отсутствует.',
   'Предложи минимальный план и уточни предположения до реализации. Не добавляй функции без моего согласия.',
   'Не используй реальные личные данные, платежи или внешние ключи в демонстрации.',
   'Для каждого шага покажи, как мне самостоятельно проверить результат, включая неудобные случаи и возможный откат.'
  ].join('\n');
  out.textContent=task;box.hidden=false;status.textContent='';
  box.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});
 });
 copy.addEventListener('click',async()=>{
  if(!out.textContent)return;
  try{
   if(!navigator.clipboard?.writeText)throw Error('no clipboard');
   await navigator.clipboard.writeText(out.textContent);
   status.textContent='Скопировано. Можно вставить в выбранный тобой инструмент.';
  }catch{
   status.textContent='Не удалось скопировать автоматически. Выдели текст в блоке и скопируй вручную.';
  }
 });
}
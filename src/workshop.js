import { workshopPrompt, askWorkshopPixie } from './workshop-core.js';
import { friendlyError } from './pix-errors.js';
const form=document.querySelector('#idea-form');
if(form){
 const box=document.querySelector('#idea-output-wrap'),out=document.querySelector('#idea-output');
 const copy=document.querySelector('#copy-idea'),status=document.querySelector('#copy-status');
 const ai=document.querySelector('#idea-ai');
 const aiStatus=document.querySelector('#idea-ai-status');
 const title=box.querySelector('h3');
 let aiBusy=false;
 const fields=()=>({idea:form.querySelector('#idea-what').value.trim(),audience:form.querySelector('#idea-who').value.trim(),first:form.querySelector('#idea-first').value.trim(),check:form.querySelector('#idea-check').value.trim()});
 ai.addEventListener('click',async()=>{
  if(aiBusy||!form.reportValidity())return;
  let prompt;
  try{prompt=workshopPrompt(fields());}catch{aiStatus.textContent='Заполни все четыре поля своими словами.';return;}
  aiBusy=true;ai.disabled=true;copy.disabled=true;
  form.querySelector('[type="submit"]').disabled=true;
  aiStatus.textContent='Пикси собирает задание по твоим ответам…';aiStatus.classList.add('is-busy');
  box.hidden=false;box.classList.add('is-ai');box.setAttribute('aria-busy','true');
  title.textContent='Задание от Пикси';out.textContent='';status.textContent='';
  try{
   const reply=await askWorkshopPixie(prompt,part=>{out.textContent+=part;});
   out.textContent=reply;
   aiStatus.textContent='Готово. Проверь, что Пикси правильно поняла твою идею. Можно уточнить детали в чате.';
  }catch(error){
   out.textContent='';
   aiStatus.textContent=error?.name==='AbortError'?'Ответ остановлен. Поля остались на месте.':friendlyError(error);
  }finally{
   aiBusy=false;ai.disabled=false;copy.disabled=!out.textContent;
   form.querySelector('[type="submit"]').disabled=false;
   aiStatus.classList.remove('is-busy');box.removeAttribute('aria-busy');
  }
 });
 form.addEventListener('submit',event=>{
  event.preventDefault();
  if(aiBusy||!form.reportValidity())return;
  title.textContent='Вот начало твоего задания';box.classList.remove('is-ai');copy.disabled=false;aiStatus.textContent='';
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
const filters=[...document.querySelectorAll('[data-filter]')];
const items=[...document.querySelectorAll('[data-topic]')];
for(const button of filters){
 button.addEventListener('click',()=>{
  const active=button.dataset.filter;
  for(const candidate of filters)candidate.setAttribute('aria-pressed',String(candidate===button));
  for(const card of items)card.hidden=active!=='all'&&card.dataset.topic!==active;
 });
}
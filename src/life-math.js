const form=document.querySelector('#discount-form');
if(form){
 const price=document.querySelector('#price'), discount=document.querySelector('#discount-percent');
 const total=document.querySelector('#discount-total'), details=document.querySelector('#discount-steps');
 const error=document.querySelector('#discount-error');
 const money=new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2});
 const valid=(a,b)=>Number.isFinite(a)&&a>=0&&a<=100000000&&Number.isFinite(b)&&b>=0&&b<=100;
 function render(){
  const a=price.value.trim()===''?NaN:Number(price.value);
  const b=discount.value.trim()===''?NaN:Number(discount.value);
  const ok=valid(a,b);error.hidden=ok;
  if(!ok){total.textContent='—';details.textContent='Введи цену от 0 и скидку от 0 до 100%.';error.textContent='Эти числа пока нельзя посчитать. Проверь оба поля.';return;}
  const saved=Math.round((a*b/100)*100)/100;
  const final=Math.round((a-saved)*100)/100;
  total.textContent=money.format(final);
  details.textContent=b+'% от '+money.format(a)+' — это '+money.format(saved)+' экономии.';
 }
 form.addEventListener('input',render);form.addEventListener('submit',e=>e.preventDefault());render();
}
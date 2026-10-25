// Только отображение: в хранилище и <input type="date"> остаётся ISO YYYY-MM-DD.
export function ruDate(value) {
 const s=String(value??'');
 return s.replace(/^(\d{4})-(\d{2})-(\d{2})(?:T|\s)?(\d{2}:\d{2})?(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?/, (_all,y,m,d,time,zone)=>`${d}.${m}.${y.slice(2)}${time?' '+time:''}`);
}
export function decorateDates(root) {
 for(const field of root.querySelectorAll('input[type="date"],input[type="datetime-local"]')) {
  if(field.nextElementSibling?.classList.contains('date-preview'))continue;
  const note=document.createElement('small'); note.className='date-preview';
  note.textContent=field.value ? `Дата: ${ruDate(field.value)}` : 'Дата не выбрана';
  field.after(note);
 }
}
export function refreshDatePreview(field){
 const note=field.nextElementSibling;
 if(note?.classList.contains('date-preview'))note.textContent=field.value ? `Дата: ${ruDate(field.value)}` : 'Дата не выбрана';
}

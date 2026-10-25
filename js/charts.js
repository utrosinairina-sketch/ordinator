import {ruDate} from './dates.js';
const colors=['#007e8f','#dc6e32','#7354bd','#2e8e54','#b53065','#a3730e','#2365ce','#846246','#af377f','#337f9c','#a53f34','#476f31'];
export function colorForSeries(i){return i<colors.length?colors[i]:`hsl(${Math.round((i-colors.length)*137.508+23)%360} 64% 35%)`;}
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
/** Общая временная ось; индивидуальная шкала по единице измерения, чтобы не смешивать ммоль/л и %. */
export function multiPlot(series){
 const samples=series.flatMap(s=>s.points.filter(p=>/^\d{4}-\d\d-\d\d/.test(p.date)).map(p=>({...p,series:s})));
 if(!samples.length)return '<p class="muted">Нет сохранённых числовых измерений.</p>';
 const dates=[...new Set(samples.map(x=>x.date))].sort();
 const width=Math.max(460,Math.min(12000,dates.length*82+105));
 const left=70,right=25,top=30,bottom=82,plotH=190,plotW=width-left-right;
 const px=d=>left+(dates.length===1?0.5:dates.indexOf(d)/(dates.length-1))*plotW;
 const byUnit=new Map();
 for(const s of series){const unit=s.unit||'ед. не указана';const nums=series.filter(z=>(z.unit||'ед. не указана')===unit).flatMap(z=>z.points.map(p=>p.n)).filter(Number.isFinite);byUnit.set(unit,{min:Math.min(...nums),max:Math.max(...nums)});}
 const y=(n,unit)=>{const g=byUnit.get(unit||'ед. не указана');return top+plotH-(g.max===g.min?0.5:(n-g.min)/(g.max-g.min))*plotH;};
 const grids=dates.map((d,i)=>`<line x1="${px(d)}" y1="${top}" x2="${px(d)}" y2="${top+plotH}" stroke="#eef3f4"/><text transform="translate(${px(d)},${top+plotH+13}) rotate(-45)" text-anchor="end" font-size="11" fill="#53666d">${escape(ruDate(d))}</text>`).join('');
 const marks=series.map((s,i)=>s.points.map(p=>{
  const x=px(p.date),yy=y(p.n,s.unit),title=`${s.label} · ${ruDate(p.date)} · ${p.n} ${s.unit||''}${p.meta?' · '+p.meta:''}`;
  return `<circle cx="${x}" cy="${yy}" r="5" fill="${colorForSeries(i)}" stroke="#fff" stroke-width="1.5"><title>${escape(title)}</title></circle>`;
 }).join('')).join('');
 const key=series.map((s,i)=>{const unit=s.unit||'ед. не указана',v=byUnit.get(unit);return `<span class="plot-legend-item"><i style="background:${colorForSeries(i)}"></i>${escape(s.label)} · ${escape(unit)} <small>(${escape(v.min)}–${escape(v.max)})</small></span>`;}).join('');
 return `<div class="plot-legends">${key}</div><p class="muted">Каждая единица измерения имеет собственную шкалу. Совпадение высоты точек не означает совпадение численных значений. Между измерениями линии не дорисовываются.</p><div class="plot-scroll"><svg viewBox="0 0 ${width} ${top+plotH+bottom}" style="width:${width}px;height:auto" role="img" aria-label="Измерения выбранных показателей по датам"><line x1="${left}" y1="${top+plotH}" x2="${width-right}" y2="${top+plotH}" stroke="#a2b4b8"/>${grids}${marks}</svg></div>`;
}

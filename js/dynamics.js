import {LAB_BY_ID,legacyMetricId,numeric,egfr2021,ageOn} from './clinical.js';

function strictMeasurement(raw){
  if(raw===null||raw===undefined)return null;
  const x=String(raw).trim().replace(',','.').match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(?:\s+([^\d].*))?$/u);
  return x && Number.isFinite(Number(x[1]))?{n:Number(x[1]),unit:x[2]?.trim()||''}:null;
}
function timeKey(record){return String(record.datetime||(record.date?(record.date+(record.time?'T'+record.time:'')):'')).slice(0,16);}
export function seriesForPatient(p){
  const groups={round:new Map(),exam:new Map(),lab:new Map(),study:new Map()};
  const push=(source,key,label,unit,date,n,meta='',ref=null)=>{
    if(n===null||n===undefined||!Number.isFinite(n)||!/^\d{4}-\d{2}-\d{2}/.test(date))return;
    if(!groups[source].has(key))groups[source].set(key,{key,label,unit,points:[]});
    groups[source].get(key).points.push({date,n,meta,ref});
  };
  for(const r of p.rounds||[]){
    const date=timeKey(r);const values=[['hr','ЧСС','уд/мин'],['rr','ЧДД','/мин'],['spo2','SpO₂','%'],['temp','Температура','°C'],['urine','Диурез','мл'],['intake','Поступило жидкости','мл']];
    for(const [key,label,unit] of values)push('round',key,label,unit,date,numeric(r[key]),r.periodHours?`За ${r.periodHours} ч`: 'Период не указан');
    const bp=String(r.bp||'').trim().match(/^(\d{2,3})\s*\/\s*(\d{2,3})(?:\s|$)/);
    if(bp){push('round','systolic','АД систолическое','мм рт. ст.',date,Number(bp[1]));push('round','diastolic','АД диастолическое','мм рт. ст.',date,Number(bp[2]));}
    if(r.periodHours&&numeric(r.intake)!==null&&numeric(r.urine)!==null)push('round','balance','Баланс жидкости','мл',date,numeric(r.intake)-numeric(r.urine),`За ${r.periodHours} ч`);
  }
  // Старый осмотр хранит текущие поля и дату, а не историю: не придумываем даты прошлых осмотров.
  const examDate=(p.examHistory||[]).some(x=>x.date===p.examDate)?'':String(p.examDate||'');
  for(const [sys,key,name,unit] of [['cardio','ЧСС','ЧСС (осмотр)','уд/мин'],['resp','ЧДД','ЧДД (осмотр)','/мин'],['resp','Сатурация','SpO₂ (осмотр)','%']]){
    const v=strictMeasurement(p.exam?.[sys]?.[key]);
    if(v && (!v.unit||v.unit===unit||v.unit==='уд/мин'||v.unit==='%'))push('exam',sys+':'+key,name,unit,examDate,v.n);
  }
  const bp=String(p.exam?.cardio?.['АД']||'').match(/^(\d{2,3})\s*\/\s*(\d{2,3})(?:\s|$)/);
  if(bp){push('exam','sys','АД систолическое (осмотр)','мм рт. ст.',examDate,Number(bp[1]));push('exam','dia','АД диастолическое (осмотр)','мм рт. ст.',examDate,Number(bp[2]));}
  const snapshots=p.examHistory||[];
  for(const record of snapshots){
    const date=record.date||'';
    for(const [sys,key,name,unit] of [['cardio','ЧСС','ЧСС (осмотр)','уд/мин'],['resp','ЧДД','ЧДД (осмотр)','/мин'],['resp','Сатурация','SpO₂ (осмотр)','%']]){
      const v=strictMeasurement(record.exam?.[sys]?.[key]);
      if(v&&(!v.unit||v.unit===unit||v.unit==='уд/мин'||v.unit==='%'))push('exam',sys+':'+key,name,unit,date,v.n);
    }
    const bp=String(record.exam?.cardio?.['АД']||'').match(/^(\d{2,3})\s*\/\s*(\d{2,3})(?:\s|$)/);
    if(bp){push('exam','sys','АД систолическое (осмотр)','мм рт. ст.',date,Number(bp[1]));push('exam','dia','АД диастолическое (осмотр)','мм рт. ст.',date,Number(bp[2]));}
  }
  for(const r of p.results||[]){
    if(r.type!=='lab')continue;
    const id=legacyMetricId(r);
    const def=id?LAB_BY_ID[id]:null;
    const parsed=r.numericValue!==undefined? {n:numeric(r.numericValue),unit:r.unit||def?.unit||''}:strictMeasurement(r.value);
    if(!parsed||parsed.n===null)continue;
    // Legacy values with unspecified unit remain in a distinct series; never guess units.
    const unit=r.unit||parsed.unit||((r.metricId&&def)?def.unit:'не указана');
    const name=def?.name||String(r.name||'Лабораторный показатель');
    const method=String(r.method||'');
    const specimen=String(r.specimen||'');
    const metricKey=(id||r.name||'unknown')+'|'+unit+'|'+method+'|'+specimen;
    push('lab',metricKey,name,unit,timeKey(r),parsed.n,[specimen,method].filter(Boolean).join(' · '),r.referenceSnapshot||null);
    if(id==='creatinine'&&unit==='мкмоль/л'&&r.metricId==='creatinine'&&p.creatinineIdms===true){
      const age=ageOn(p.dob,r.date);
      const calc=egfr2021(parsed.n,age,p.sex);
      if(calc!==null)push('lab','egfr','рСКФ CKD-EPI 2021','мл/мин/1,73 м²',timeKey(r),Math.round(calc*10)/10,'Расчётная величина (IDMS)');
    }
  }
  for(const r of p.studies||[]){
    const d=timeKey(r);let key,label,unit,value;
    for(const [prop,k,l,u] of [['hr','ecg.hr','ЧСС (ЭКГ)','уд/мин'],['ef','echo.ef','ФВЛЖ','%'],['fluid','pericardium.fluid','Жидкость в перикарде','мл'],['right','pleura.right','Жидкость в правой плевре','мл'],['left','pleura.left','Жидкость в левой плевре','мл']]){
      if((r.type+'.'+prop)!==k)continue;
      push('study',k,l,u,d,numeric(r[prop]));
    }
    if(r.type==='drain'&&r.drainLabel&&r.location){
      push('study','drain:'+r.location+'|'+r.drainLabel+'|'+(r.periodHours||'не указан'),
        `Дренаж ${r.location} — ${r.drainLabel}`,'мл',d,numeric(r.volume),
        `Период: ${r.periodHours?r.periodHours+' ч':'не указан'}`);
    }
  }
  return Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,[...v.values()].map(s=>({...s,points:s.points.sort((a,b)=>a.date.localeCompare(b.date))})).sort((a,b)=>a.label.localeCompare(b.label,'ru'))]));
}
export function svgPlot(points,unit){
  if(!points.length)return '';
  const xs=points.map(p=>Date.parse(p.date.length===10?p.date+'T12:00:00':p.date)).filter(Number.isFinite);
  if(xs.length!==points.length)return '';
  const minX=Math.min(...xs),maxX=Math.max(...xs),ys=points.map(p=>p.n),minY=Math.min(...ys),maxY=Math.max(...ys);
  const min=minY===maxY?minY-1:minY, max=minY===maxY?maxY+1:maxY;
  const dots=points.map((p,i)=>{
    const x=maxX===minX?190:38+(xs[i]-minX)/(maxX-minX)*314;
    const y=115-(p.n-min)/(max-min)*83;
    const title=`${p.date}: ${p.n}${unit?' '+unit:''}${p.meta?' ('+p.meta+')':''}`.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="#087f8c"><title>${title}</title></circle>`;
  }).join('');
  const safe=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  // Раздельные измерения показаны точками: интервалы между ними не интерполируем.
  return `<svg class="chart" viewBox="0 0 380 155" role="img" aria-label="Сохранённые измерения по фактическим датам"><line x1="38" y1="115" x2="352" y2="115" stroke="#cbd8db"/><line x1="38" y1="25" x2="38" y2="115" stroke="#cbd8db"/>${dots}<text x="5" y="18" font-size="10" fill="#64747a">${safe(maxY)}</text><text x="5" y="111" font-size="10" fill="#64747a">${safe(minY)}</text><text x="38" y="143" font-size="10" fill="#64747a">${safe(points[0].date.slice(0,10))}</text><text x="352" y="143" text-anchor="end" font-size="10" fill="#64747a">${safe(points.at(-1).date.slice(0,10))}</text></svg>`;
}

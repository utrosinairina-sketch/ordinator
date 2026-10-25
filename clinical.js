// Справочники: без фиктивных лабораторных референсов и клинических порогов.
export const LAB_GROUPS = [
  {id:'heart', name:'🫀 Сердце', metrics:['troponin','ntprobnp']},
  {id:'kidney',name:'🫘 Почки',metrics:['creatinine','urea','urine_protein']},
  {id:'liver',name:'Печень и белковый обмен',metrics:['alt','ast','bilirubin','bilirubin_direct','total_protein','albumin']},
  {id:'pancreas',name:'Поджелудочная железа',metrics:['amylase','pancreatic_amylase']},
  {id:'inflammation',name:'Маркеры системного воспаления',metrics:['crp','pct','leukocytes','neutrophils','lymphocytes','monocytes','eosinophils','basophils','bands']},
  {id:'blood',name:'Кровь',metrics:['hemoglobin','reticulocytes','erythrocytes','hematocrit','mcv','mch','mchc','platelets','ferritin','iron','transferrin']},
  {id:'hemostasis',name:'Гемостаз',metrics:['inr','pt','aptt','fibrinogen']},
  {id:'electrolytes',name:'Электролиты и КЩС',metrics:['sodium','potassium','magnesium','calcium','ph','pco2','lactate','bicarbonate']},
  {id:'other',name:'Прочее',metrics:['glucose']},
];
const entry=(id,name,unit='',aliases=[],specimen='',allowNegative=false)=>({id,name,unit,aliases,specimen,allowNegative});
export const LAB_METRICS = [
  entry('troponin','Тропонин (метод уточнить)','',['Тропонин'],'кровь'), entry('ntprobnp','NT-proBNP','пг/мл',['NT-proBNP'],'кровь'),
  entry('creatinine','Креатинин крови','мкмоль/л',['Креатинин'],'сыворотка'), entry('urea','Мочевина крови','ммоль/л',['Мочевина'],'сыворотка'),entry('urine_protein','Белок в моче','г/л',['Белок в моче'],'моча'),
  entry('alt','АЛТ','Ед/л',['АЛТ'],'сыворотка'),entry('ast','АСТ','Ед/л',['АСТ'],'сыворотка'),entry('bilirubin','Билирубин общий','мкмоль/л',['Билирубин'],'сыворотка'),entry('bilirubin_direct','Билирубин прямой','мкмоль/л',[],'сыворотка'),entry('total_protein','Общий белок','г/л',[],'сыворотка'),entry('albumin','Альбумин','г/л',[],'сыворотка'),
  entry('amylase','Амилаза','Ед/л',[],'сыворотка'),entry('pancreatic_amylase','Амилаза панкреатическая','Ед/л',[],'сыворотка'),
  entry('crp','СРБ','мг/л',['СРБ','CRP'],'сыворотка'),entry('pct','Прокальцитонин','нг/мл',['Прокальцитонин'],'сыворотка'),entry('leukocytes','Лейкоциты','10⁹/л',['ОАК: лейкоциты'],'кровь'),
  entry('neutrophils','Нейтрофилы','%'),entry('lymphocytes','Лимфоциты','%'),entry('monocytes','Моноциты','%'),entry('eosinophils','Эозинофилы','%'),entry('basophils','Базофилы','%'),entry('bands','Палочкоядерные нейтрофилы','%'),
  entry('hemoglobin','Гемоглобин','г/л',['ОАК: Hb'],'кровь'),entry('reticulocytes','Ретикулоциты','%',[],'кровь'),entry('erythrocytes','Эритроциты','10¹²/л',[],'кровь'),entry('hematocrit','Гематокрит','%',[],'кровь'),entry('mcv','MCV','фл',[],'кровь'),entry('mch','MCH','пг',[],'кровь'),entry('mchc','MCHC','г/л',[],'кровь'),entry('platelets','Тромбоциты','10⁹/л',['ОАК: тромбоциты'],'кровь'),entry('ferritin','Ферритин','мкг/л',[],'сыворотка'),entry('iron','Железо сывороточное','мкмоль/л',[],'сыворотка'),entry('transferrin','Трансферрин','г/л',[],'сыворотка'),
  entry('inr','МНО','безразмерный',['МНО'],'плазма'),entry('pt','Протромбиновое время','с',['ПВ'],'плазма'),entry('aptt','АЧТВ','с',['АЧТВ'],'плазма'),entry('fibrinogen','Фибриноген','г/л',['Фибриноген'],'плазма'),
  entry('sodium','Натрий','ммоль/л',['Na⁺'],'сыворотка'),entry('potassium','Калий','ммоль/л',['K⁺'],'сыворотка'),entry('magnesium','Магний','ммоль/л',['Mg²⁺'],'сыворотка'),entry('calcium','Кальций общий','ммоль/л',['Ca²⁺'],'сыворотка'),entry('ph','pH','безразмерный',['КЩС: pH'],'кровь'),entry('pco2','pCO₂','мм рт. ст.',['КЩС: pCO₂'],'кровь'),entry('lactate','Лактат','ммоль/л',['КЩС: лактат'],'кровь'),entry('bicarbonate','HCO₃⁻','ммоль/л',[],'кровь'),
  entry('glucose','Глюкоза','ммоль/л',['Глюкоза'],'кровь'),
];
export const LAB_BY_ID = Object.fromEntries(LAB_METRICS.map(x=>[x.id,x]));
export function legacyMetricId(r) {
  if(r.metricId && LAB_BY_ID[r.metricId])return r.metricId;
  const name=String(r.name||'').trim().toLowerCase();
  const matches=LAB_METRICS.filter(m=>[m.name,...m.aliases].some(n=>n.toLowerCase()===name));
  return matches.length===1 ? matches[0].id : null;
}
export const STUDY_GROUPS=[
  {id:'cardio',name:'❤️ Сердечно-сосудистая система',items:[['ecg','ЭКГ'],['echo','ЭхоКГ'],['holter','Холтеровское мониторирование'],['pericardium','УЗИ перикарда']]},
  {id:'resp',name:'🫁 Дыхательная система',items:[['pleura','УЗИ плевры'],['xray','Рентгенография'],['ct','Компьютерная томография']]},
  {id:'wound',name:'🩹 Раны и дренажи',items:[['drain','Дренажи']]},
  {id:'gi',name:'Желудочно-кишечный тракт',items:[['gi','Исследования ЖКТ']]},
  {id:'renal',name:'Мочевыделительная система',items:[['renal','Исследования мочевыделительной системы']]},
];
export const ECG_RHYTHMS=['Синусовый','Предсердный','Фибрилляция предсердий','Трепетание предсердий','Узловой ритм','Желудочковый ритм','Ритм электрокардиостимулятора','Другой','Не определён'];
export const DRAIN_LOCATIONS=['Средостение','Перикард','Плевра правая','Плевра левая'];
export const THERAPY_GROUPS=['Антибактериальная терапия','Иммуносупрессивная терапия','Антиагреганты','Антикоагулянты','Препараты для сердечно-сосудистой системы','Диуретики','Гастропротективная терапия','Обезболивающие','Прочие препараты'];
export const THERAPY_STATUSES=[['active','Действует'],['planned_stop','Планируется отмена'],['cancelled','Отменено'],['completed','Курс завершён']];
export const BUILTIN_DRUGS=[
  {generic:'Ацетилсалициловая кислота',category:'Антиагреганты'},
  {generic:'Клопидогрел',category:'Антиагреганты'},
  {generic:'Варфарин',category:'Антикоагулянты'},
  {generic:'Эноксапарин натрия',category:'Антикоагулянты'},
  {generic:'Гепарин натрия',category:'Антикоагулянты'},
  {generic:'Фуросемид',category:'Диуретики'},
  {generic:'Парацетамол',category:'Обезболивающие'},
];
export function numeric(value){
  if(value===null || value===undefined || String(value).trim()==='')return null;
  const s=String(value).trim().replace(',','.');
  return /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(s)&&Number.isFinite(Number(s))? Number(s):null;
}
export function ageOn(dob, date) {
  if(!/^\d{4}-\d\d-\d\d$/.test(String(dob)) || !/^\d{4}-\d\d-\d\d$/.test(String(date)))return null;
  const [y,m,d]=dob.split('-').map(Number),[yy,mm,dd]=date.split('-').map(Number);
  const age=yy-y-(mm<m||(mm===m&&dd<d)?1:0);
  return age>=18&&age<=120?age:null;
}
// CKD-EPI 2021, взрослые, только стандартизованный IDMS-креатинин сыворотки.
// https://www.niddk.nih.gov/research-funding/research-programs/kidney-clinical-research-epidemiology/laboratory/glomerular-filtration-rate-equations/adults
export function egfr2021(creatinineUmol,age,sex){
  if(!Number.isFinite(creatinineUmol)||creatinineUmol<=0||!Number.isInteger(age)||age<18||age>120||!['female','male'].includes(sex))return null;
  const scr=creatinineUmol/88.4,k=sex==='female'?0.7:0.9,a=sex==='female'?-0.241:-0.302;
  return 142*Math.pow(Math.min(scr/k,1),a)*Math.pow(Math.max(scr/k,1),-1.2)*Math.pow(0.9938,age)*(sex==='female'?1.012:1);
}

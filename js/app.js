import { labBySystem, studyBySystem, examFields, roundFields } from './catalog.js';
import { STORAGE_KEY, loadData, saveData, createBackup, readBackup } from './storage.js';
import {LAB_GROUPS, LAB_BY_ID, legacyMetricId, STUDY_GROUPS, ECG_RHYTHMS, DRAIN_LOCATIONS, THERAPY_GROUPS, THERAPY_STATUSES, BUILTIN_DRUGS, numeric, ageOn, egfr2021} from './clinical.js';
import {seriesForPatient,svgPlot} from './dynamics.js';
import {readTables} from './excel.js';

const app = document.getElementById('app');
const status = document.getElementById('save-status');
const alertBox = document.getElementById('storage-alert');
const toastBox = document.getElementById('toast');
const backupInput = document.getElementById('backup-file');
const loaded = loadData();
let state = loaded.state;
if (!state.labRefs || typeof state.labRefs !== 'object') state.labRefs={};
if (!Array.isArray(state.drugCatalog)) state.drugCatalog=[];
let storageError = loaded.error;
let saveTimer = null;
let toastTimer = null;
let page = 'patients';
let selected = null;
let patientTab = 'exam';
let graphPatient = null;
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedCalendarDate = today();
const expandedPanels=new Map();
function show(html){app.innerHTML=html;for(const el of app.querySelectorAll('details[data-panel]'))if(expandedPanels.has(el.dataset.panel))el.open=expandedPanels.get(el.dataset.panel);}

function dateKey(d) {
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}
function today() { return dateKey(new Date()); }
function localDateTime() {
  const d = new Date();
  return `${today()}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
}
function id(prefix) { return `${prefix}${globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`}`; }
const getPatient = pid => state.patients.find(p => String(p.id) === String(pid));
function ensure(p) {
  if (!p) return;
  if (!p.exam || typeof p.exam !== 'object' || Array.isArray(p.exam)) p.exam = {};
  if (!Array.isArray(p.rounds)) p.rounds = [];
  if (!Array.isArray(p.results)) p.results = [];
  if (typeof p.notes !== 'string') p.notes = String(p.notes ?? '');
  if (!p.systemNotes || typeof p.systemNotes !== 'object') p.systemNotes = {};
  if (!Array.isArray(p.examHistory))p.examHistory=[];
  if (!Array.isArray(p.studies))p.studies=[];
  if (!Array.isArray(p.therapy))p.therapy=[];
  if (!Array.isArray(p.therapyHistory))p.therapyHistory=[];
  if (!Array.isArray(p.therapySnapshots))p.therapySnapshots=[];
}
function btn(label, action, props = {}, kind = 'btn') {
  const attrs = Object.entries(props).map(([key, value]) => ` data-${key}="${esc(value)}"`).join('');
  return `<button type="button" class="${kind}" data-action="${esc(action)}"${attrs}>${esc(label)}</button>`;
}
function msg(message) {
  toastBox.textContent = message;
  toastBox.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastBox.classList.remove('visible'), 2300);
}
function updateStorageAlert() {
  alertBox.classList.toggle('hidden', !storageError);
  if (storageError) {
    alertBox.replaceChildren();
    const info = document.createElement('div');
    info.textContent = `⚠ ${storageError}`;
    alertBox.append(info);
    const controls = document.createElement('div');
    controls.className = 'inline-actions';
    controls.innerHTML = `${btn('Экспорт текущих данных', 'export', {}, 'btn small secondary')}${btn('Скачать исходное хранилище', 'raw-backup', {}, 'btn small secondary')}`;
    alertBox.append(controls);
  }
}
function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (storageError) { status.textContent = 'Ошибка сохранения'; updateStorageAlert(); return false; }
  try {
    saveData(state);
    status.textContent = '✓ Сохранено';
    return true;
  } catch (error) {
    storageError = `Изменения сейчас не сохраняются: ${error.message}. Выгрузите резервную копию текущих данных.`;
    status.textContent = 'Ошибка сохранения';
    updateStorageAlert();
    return false;
  }
}
function changed() {
  status.textContent = 'Сохраняется…';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(persist, 250);
}
function draft(scope, key, defaultValue = '') {
  const value = state.drafts?.[scope]?.[key];
  return esc(value === undefined ? defaultValue : value);
}
function input(scope, key, label, opts = {}) {
  const a = [
    `type="${opts.type || 'text'}"`,
    `data-key="${esc(key)}"`,
    `value="${draft(scope, key, opts.value ?? '')}"`,
    opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : '',
    opts.step ? `step="${esc(opts.step)}"` : '',
    opts.min ? `min="${esc(opts.min)}"` : '',
    opts.max ? `max="${esc(opts.max)}"` : '',
  ].filter(Boolean).join(' ');
  return `<div><label>${esc(label)}</label><input ${a}></div>`;
}
function textarea(scope, key, label, placeholder = '') {
  return `<label>${esc(label)}</label><textarea data-key="${esc(key)}" placeholder="${esc(placeholder)}">${draft(scope, key)}</textarea>`;
}
function select(scope, key, label, choices, defaultValue = '') {
  const value = state.drafts?.[scope]?.[key] ?? defaultValue;
  return `<label>${esc(label)}</label><select data-key="${esc(key)}">${choices.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
}
function draftValues(scope, keys) {
  const container = [...app.querySelectorAll('[data-draft-scope]')].find(x => x.dataset.draftScope === scope);
  if (!container) return null;
  for (const el of container.querySelectorAll('[data-key]')) {
    if (!el.checkValidity()) { el.reportValidity(); return null; }
  }
  const out = {};
  for (const key of keys) {
    const el = [...container.querySelectorAll('[data-key]')].find(x => x.dataset.key === key);
    out[key] = String(el?.value ?? '').trim();
  }
  return out;
}
function sortByDateNewest(a, b) { return String(b.date ?? '').localeCompare(String(a.date ?? '')); }
function render() {
  document.querySelectorAll('.nav button').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  if (selected && getPatient(selected)) { show(renderPatient(getPatient(selected))); return; }
  selected = null;
  switch (page) {
    case 'patients': show(renderPatients()); break;
    case 'calendar': show(renderCalendar()); break;
    case 'tasks': show(renderTasks()); break;
    case 'graphs': show(renderDynamics()); break;
    default: show(renderPatients()); break;
  }
}
function renderPatients() {
  const cards = state.patients.map(p => `<div class="card"><div class="row between"><div class="grow"><strong>${esc(p.name || 'Новый пациент')}</strong><div class="muted">${esc(p.ward || 'Палата —')} · ${esc(p.diagnosis || 'Диагноз не указан')}</div></div>${btn('Открыть', 'open-patient', { pid:p.id }, 'btn secondary')}</div></div>`).join('');
  return `<div class="row between"><div class="big">Пациенты</div>${btn('+ Добавить', 'new-patient')}</div>${cards || '<div class="card empty">Добавь первого пациента.</div>'}<div class="card"><strong>Резервное копирование</strong><p class="muted">При смене устройства или браузера локальные записи не переносятся автоматически. Экспортируй JSON до обновлений и регулярно сохраняй его в защищённом месте.</p><div class="inline-actions">${btn('Скачать копию JSON', 'export', {}, 'btn secondary')}${btn('Восстановить из JSON', 'import', {}, 'btn ghost')}</div></div><div class="alert">Демонстрационная версия. Данные хранятся в localStorage без шифрования. Не вводите реальные ФИО, диагнозы и другие идентифицирующие медицинские данные.</div>`;
}
function renderPatient(p) {
  ensure(p);
  const tabs=[['walk','Обход'],['exam','Осмотр по системам'],['labs','Лаборатория'],['studies','Инструментальные'],['therapy','Терапия']];
  const body=patientTab==='walk'?renderRoundsV9(p):patientTab==='exam'?renderExam(p):patientTab==='labs'?renderLabs(p):patientTab==='studies'?renderStudies(p):renderTherapy(p);
  return `<div class="row between">${btn('← Назад','close-patient',{},'btn ghost')}${btn('Сохранить','save')}</div><div class="card"><label>ФИО / условное обозначение</label><input data-patient-field="name" value="${esc(p.name)}" placeholder="Пациент 01"><div class="grid"><div><label>Палата</label><input data-patient-field="ward" value="${esc(p.ward)}"></div><div><label>Дата поступления</label><input data-patient-field="created" type="date" value="${esc(p.created||today())}"></div></div><label>Диагноз / операция</label><textarea data-patient-field="diagnosis">${esc(p.diagnosis)}</textarea><details><summary class="muted">Данные для расчёта рСКФ (по желанию)</summary><div class="grid"><div><label>Дата рождения</label><input data-patient-field="dob" type="date" value="${esc(p.dob||'')}"></div><div><label>Пол для формулы CKD-EPI</label><select data-patient-field="sex"><option value="">Не указан</option><option value="female" ${p.sex==='female'?'selected':''}>Женский</option><option value="male" ${p.sex==='male'?'selected':''}>Мужской</option></select></div></div><label class="checkline"><input type="checkbox" data-patient-check="creatinineIdms" ${p.creatinineIdms===true?'checked':''}> Подтверждено: креатинин сыворотки стандартизирован по IDMS</label></details></div><div class="tabchips">${tabs.map(([key,label])=>`<button type="button" class="chip ${patientTab===key?'active':''}" data-action="patient-tab" data-tab="${key}">${esc(label)}</button>`).join('')}</div>${body}<div class="sectionTitle">Общие замечания / план</div><textarea data-patient-field="notes">${esc(p.notes)}</textarea><div class="inline-actions">${btn('Сохранить карту','save')}${btn('Удалить пациента','delete-patient',{pid:p.id},'btn danger')}</div><div class="alert" style="margin-top:14px">Локальная версия для обезличенных данных: без шифрования и разграничения доступа, не является медицинской информационной системой.</div>`;
}
function renderExam(p) {
  return `<div class="sectionTitle">Осмотр и параметры</div><label>Дата и время осмотра</label><input type="datetime-local" data-patient-field="examDate" value="${esc(p.examDate || localDateTime())}"><p class="muted">Редактируемые поля сохраняются автоматически при вводе.</p>${examFields.map(s => `<div class="syscard"><div class="syshead">${esc(s.name)}</div>${s.items.map(item => `<label>${esc(item.label)}</label><textarea data-exam-system="${esc(s.id)}" data-exam-key="${esc(item.key)}" placeholder="${esc(item.placeholder)}">${esc((p.exam[s.id] || {})[item.key] ?? '')}</textarea>`).join('')}</div>`).join('')}<div class="inline-actions">${btn('Сохранить осмотр на дату','save-exam',{pid:p.id},'btn secondary')}</div><p class="muted">Сохраняет датированный снимок заполненных показателей для графиков. Повторное сохранение за то же время обновляет эту запись.</p><details class="card"><summary>Сохранённые осмотры (${p.examHistory.length})</summary>${p.examHistory.slice().reverse().map(r=>`<div class="resultrow"><strong>${esc(formatDateTime(r.date))}</strong><div class="muted">${esc(JSON.stringify(r.exam))}</div>${btn('Удалить','delete-exam',{pid:p.id,rid:r.id},'btn danger small')}</div>`).join('')}</details>`;
}
function parseNumeric(value) {
  const source = String(value ?? '').trim().replace(',', '.');
  // Игнорируем 120/70, диапазоны, заключения и другие нечисловые значения.
  const match = source.match(/^([+-]?(?:\d+(?:\.\d+)?|\.\d+))(?:\s+([^\d].*))?$/u);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  return { n, unit:(match[2] || '').trim() };
}
function patientChoices() {
  return [['','Общее'], ...state.patients.map(p => [String(p.id),p.name || 'Пациент без имени'])];
}
function renderCalendar() {
  const y = calendarMonth.getFullYear(), m = calendarMonth.getMonth();
  const first = new Date(y,m,1), start = new Date(y,m,1-(first.getDay()+6)%7);
  const months = ['январь','февраль','март','апрель','май','июнь','июль','август','сентябрь','октябрь','ноябрь','декабрь'];
  const names = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  let cells='';
  for (let i=0; i<42; i++) {
    const date = new Date(start.getFullYear(),start.getMonth(),start.getDate()+i);
    const key = dateKey(date);
    const has = state.tasks.some(t=>t.date===key) || state.events.some(e=>e.date===key);
    cells += `<button type="button" data-action="calendar-select" data-date="${key}" class="calendar-day ${date.getMonth()!==m?'outside':''} ${key===selectedCalendarDate?'selected':''} ${key===today()?'today':''}" aria-label="${key}">${date.getDate()}${has?'<span class="dot"></span>':''}</button>`;
  }
  const tasks=state.tasks.filter(t=>t.date===selectedCalendarDate).map(t=>({...t,kind:'task'}));
  const events=state.events.filter(t=>t.date===selectedCalendarDate).map(t=>({...t,kind:'event'}));
  const entries=[...tasks,...events].sort((a,b)=>Number(!!a.done)-Number(!!b.done));
  const scope='event';
  return `<div class="big">Календарь</div><p class="muted">Нажми на дату, чтобы увидеть задачи и события.</p><div class="card"><div class="row between">${btn('‹','calendar-month',{delta:-1},'btn secondary small')}<strong>${months[m]} ${y}</strong>${btn('›','calendar-month',{delta:1},'btn secondary small')}</div><div class="calendar-grid" style="margin-top:10px">${names.map(n=>`<div class="calendar-dayname">${n}</div>`).join('')}${cells}</div><div class="muted">● Есть задачи или события</div></div><div class="card"><strong>${selectedCalendarDate}</strong>${entries.map(item=>`<div class="resultrow"><div class="checkline">${item.kind==='task'?`<input type="checkbox" data-toggle-task="${esc(item.id)}" ${item.done?'checked':''} aria-label="Выполнить задачу">`:'<span>🗓️</span>'}<div class="grow"><strong>${esc(item.title)}</strong><div class="muted">${esc(getPatient(item.pid)?.name||'Общее')} · ${item.kind==='task'?'Задача':'Событие'}</div></div>${btn('Удалить','delete-item',{kind:item.kind,rid:item.id},'btn small danger')}</div></div>`).join('')||'<p class="muted">На эту дату задач и событий нет.</p>'}</div><div class="card" data-draft-scope="${scope}"><strong>Добавить событие</strong>${input(scope,'date','Дата',{type:'date',value:selectedCalendarDate})}${select(scope,'pid','Пациент',patientChoices())}${input(scope,'title','Событие / исследование',{placeholder:'Например, ОАК, ЭхоКГ, консультация'})}<div class="inline-actions">${btn('Добавить в календарь','add-event')}</div></div>`;
}
function renderTasks() {
  const scope='task';
  return `<div class="big">Задачи</div><div class="card" data-draft-scope="${scope}">${input(scope,'title','Задача',{placeholder:'Что нужно сделать'})}${input(scope,'date','Срок',{type:'date',value:today()})}${select(scope,'pid','Пациент',patientChoices())}<div class="inline-actions">${btn('Добавить задачу','add-task')}</div></div>${state.tasks.slice().sort(sortByDateNewest).map(t=>`<div class="card"><div class="checkline"><input type="checkbox" data-toggle-task="${esc(t.id)}" ${t.done?'checked':''} aria-label="Выполнить задачу"><div class="grow"><strong>${esc(t.title)}</strong><div class="muted">${esc(t.date||'Без даты')} · ${esc(getPatient(t.pid)?.name||'Общее')}</div></div>${btn('Удалить','delete-item',{kind:'task',rid:t.id},'btn small danger')}</div></div>`).join('')||'<div class="card empty">Задач пока нет.</div>'}`;
}
// ===== Клинические формы v9. Любой раздел использует тот же state/localStorage. =====
const LAB_NOTE = 'Единицы и референсы зависят от лаборатории, метода и биоматериала; проверь настройки перед клинической оценкой.';
let editingRoundId=null, editingLabId=null, editingStudyId=null, editingTherapyId=null;
let weekAnchor=today(), dynamicsGroup='round', dynamicsKey='', importStage=null, importKind='therapy';
let compareA='', compareB='';
function formatDateTime(v){return String(v||'').replace('T',' ');}
function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v));}
function getLabResults(p,metric){return p.results.filter(r=>r.type==='lab'&&legacyMetricId(r)===metric).slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.time||'').localeCompare(String(a.time||'')));}
function getPreviousLab(p,metric,date,time='',skip=''){
  return getLabResults(p,metric).filter(r=>String(r.id)!==skip && (String(r.date||'')+(r.time||''))<(date+time))[0]||null;
}
function labReference(metric){return state.labRefs?.[metric]||{};}
function referenceStatus(result){
  const ref=result.referenceSnapshot;
  if(!ref||ref.low===''&&ref.high===''||ref.low==null&&ref.high==null)return 'Референс не настроен';
  const n=numeric(result.numericValue);if(n===null)return 'Без автоматической оценки';
  const low=numeric(ref.low),high=numeric(ref.high);
  if(low!==null&&n<low)return '↓ Ниже настроенного референса';
  if(high!==null&&n>high)return '↑ Выше настроенного референса';
  return 'В пределах настроенного референса';
}
function renderLabs(p){
  let legacy=[];
  const cards=LAB_GROUPS.map(group=>{
    const blocks=group.metrics.map(mid=>{
      const metric=LAB_BY_ID[mid],scope=`lab:${p.id}:${mid}`;
      const refs=labReference(mid),refScope=`labref:${mid}`;
      const configured=refs&&String(refs.method||'').trim()&&String(refs.specimen||'').trim()&&(String(refs.low??'')!==''||String(refs.high??'')!=='');
      const chosenDate=state.drafts[scope]?.date||today(), chosenTime=state.drafts[scope]?.time||'';
      const prev=getPreviousLab(p,mid,chosenDate,chosenTime,editingLabId||'');
      const arr=getLabResults(p,mid);
      const onDate=arr.filter(r=>r.date===chosenDate);
      const prevText=prev?`${prev.numericValue??prev.value} ${prev.unit||''} — ${prev.date}${prev.time?' '+prev.time:''}`:'Предыдущих результатов нет';
      let calculated='';
      if(mid==='creatinine'){
        const last=arr.find(r=>r.metricId==='creatinine'&&r.unit==='мкмоль/л');
        const calc=last&&p.creatinineIdms===true?egfr2021(numeric(last.numericValue),ageOn(p.dob,last.date),p.sex):null;
        calculated=`<p class="muted">рСКФ CKD-EPI 2021: ${calc!==null?`<strong>${(Math.round(calc*10)/10).toFixed(1)} мл/мин/1,73 м²</strong> — расчёт на ${esc(last.date)}`:'не рассчитывается: нужны дата рождения, пол для формулы, взрослый возраст и подтверждённый IDMS-креатинин.'} Формула предназначена для взрослых; интерпретация требует врача.</p>`;
      }
      return `<details class="metric" data-panel="lab-metric:${esc(p.id)}:${esc(mid)}"><summary>${esc(metric.name)} <span class="muted">${arr.length?`· ${arr.length} измер.`:''}</span></summary><div class="metric-body">
        <div class="muted">Единица: <strong>${esc(metric.unit||'не настроена')}</strong>; биоматериал: ${esc(metric.specimen||'уточняется')}. ${esc(LAB_NOTE)}<div>${configured?`Настроенный референс: ${esc(refs.low??'—')}–${esc(refs.high??'—')} ${esc(metric.unit)} (метод: ${esc(refs.method)}, биоматериал: ${esc(refs.specimen)}). Применяется только при совпадении параметров исследования.`:'Референс: не настроен или не подтверждены условия применимости.'}</div></div>
        <div class="previous-result" data-prev-metric="${esc(mid)}" data-prev-pid="${esc(p.id)}">Предыдущий результат: ${esc(prevText)}. На ${esc(chosenDate)}: ${onDate.length?esc(onDate.map(r=>`${r.numericValue??r.value} ${r.unit||''}${r.time?' в '+r.time:''}`).join('; ')):'записей нет'}.</div>
        <div data-draft-scope="${esc(scope)}">${input(scope,'date','Дата исследования',{type:'date',value:today()})}${input(scope,'time','Время (если известно)',{type:'time'})}
          ${input(scope,'value','Текущий результат',{type:'number',step:'any',min:metric.allowNegative?'':'0',placeholder:'Число'})}
          ${metric.unit?'':input(scope,'unit','Единица измерения (обязательно; метод уточнить)',{placeholder:'Укажи лабораторную единицу'})}
          ${input(scope,'method','Метод / лаборатория',{placeholder:'Для корректного сравнения и референсов'})}
          ${input(scope,'specimen','Биоматериал',{value:metric.specimen||''})}
          ${input(scope,'comment','Комментарий (необязательно)')}
          <div class="inline-actions">${btn(editingLabId && arr.some(r=>r.id===editingLabId)?'Сохранить изменения':'Добавить результат','save-lab',{pid:p.id,mid})}${editingLabId?btn('Отменить правку','cancel-lab-edit',{},'btn ghost'):''}</div>
        </div>${calculated}
        <details><summary class="muted">Референсы этого метода (настраивает врач)</summary><div data-draft-scope="${esc(refScope)}" class="ref-grid">
        ${input(refScope,'low','Нижняя граница',{type:'number',step:'any',value:refs.low??''})}${input(refScope,'high','Верхняя граница',{type:'number',step:'any',value:refs.high??''})}
        ${input(refScope,'method','Метод / лаборатория',{value:refs.method||''})}${input(refScope,'specimen','Биоматериал',{value:refs.specimen||metric.specimen||''})}${select(refScope,'sex','Применимость по полу',[['','Уточняется / не зависит'],['female','Женский'],['male','Мужской']],refs.sex||'')}
        ${btn('Сохранить референс','save-lab-ref',{mid},'btn secondary small')}</div><p class="muted">Изменение настроек не переписывает старые оценки. Без условий применимости референсы не применяются автоматически.</p></details>
        ${arr.slice(0,25).map(r=>`<div class="resultrow"><div class="row between"><strong>${esc(r.date)} ${esc(r.time||'')}</strong><strong>${esc(r.numericValue??r.value)} ${esc(r.unit||'')}</strong></div><div class="muted">${esc(r.metricId?referenceStatus(r):'Старая запись; формат не проверен')}${r.method?' · '+esc(r.method):''}${r.comment?' · '+esc(r.comment):''}</div><div class="inline-actions">${btn('Изменить','edit-lab',{pid:p.id,rid:r.id,mid},'btn secondary small')}${btn('Удалить','delete-result',{pid:p.id,rid:r.id},'btn danger small')}</div></div>`).join('')}
      </div></details>`;
    }).join('');
    return `<details class="syscard collapsible" data-panel="lab-group:${esc(p.id)}:${esc(group.id)}"><summary class="syshead">${esc(group.name)}</summary>${blocks}</details>`;
  }).join('');
  legacy=p.results.filter(r=>r.type==='lab'&&!legacyMetricId(r));
  return `<div class="sectionTitle">Лаборатория</div><p class="muted">Числовые значения сохраняются с датой; предыдущий результат вычисляется из истории. Для показателей без подтверждённой настройки референс не применяется.</p>${cards}
   <details class="syscard"><summary class="syshead">Другие и старые лабораторные записи (${legacy.length})</summary><p class="muted">Несопоставленные старые результаты остаются доступны без потери данных.</p>${legacy.map(r=>`<div class="resultrow"><strong>${esc(r.name)}</strong> · ${esc(r.date)}<div>${esc(r.value)}</div>${btn('Удалить','delete-result',{pid:p.id,rid:r.id},'btn danger small')}</div>`).join('')}
   ${renderLegacyResultsForm(p,'lab','other')}</details>`;
}
function renderLegacyResultsForm(p,type,sys){
 const scope=`result:${p.id}:${type}:${sys}`;
 const dictionary=type==='lab'?labBySystem:studyBySystem;
 const choices=[...(dictionary[sys]||[]),'__custom'].map(x=>[x,x==='__custom'?'Другое (ввести вручную)':x]);
 return `<div data-draft-scope="${esc(scope)}"><p class="muted">Дополнительная свободная запись (сохраняется в прежнем формате)</p>${select(scope,'name','Название',choices)}${input(scope,'custom','Если другое — уточни название')}${input(scope,'date','Дата',{type:'date',value:today()})}${textarea(scope,'value','Результат / заключение')}${input(scope,'comment','Комментарий')}${btn('Добавить','add-result',{pid:p.id,type,system:sys})}</div>`;
}
const studyFields={
 ecg:[['rhythm','Ритм','rhythm'],['otherRhythm','Если другой ритм','text'],['hr','ЧСС, уд/мин','number'],['comment','Комментарий','textarea']],
 echo:[['ef','ФВЛЖ, %','number']],holter:[['comment','Краткий результат / комментарий','textarea']],
 pericardium:[['fluid','Жидкость в перикарде, мл','number'],['comment','Комментарий','textarea']],
 pleura:[['right','Жидкость в правой плевре, мл','number'],['left','Жидкость в левой плевре, мл','number'],['comment','Комментарий','textarea']],
 xray:[['comment','Краткий комментарий','textarea']],ct:[['comment','Краткий комментарий','textarea']],
 drain:[['location','Локализация','location'],['drainLabel','Идентификатор дренажа','text'],['volume','Отделяемое, мл','number'],['periodHours','Период измерения, часов','number'],['comment','Комментарий','textarea']],
 gi:[['comment','Заключение / результат','textarea']],renal:[['comment','Заключение / результат','textarea']]
};
function studyForm(p,type,title){
 const scope=`study:${p.id}:${type}`;
 const fields=studyFields[type].map(([key,label,format])=>{
   if(format==='rhythm')return select(scope,key,label,ECG_RHYTHMS.map(x=>[x,x]),'Синусовый');
   if(format==='location')return select(scope,key,label,DRAIN_LOCATIONS.map(x=>[x,x]));
   if(format==='textarea')return textarea(scope,key,label);
   return input(scope,key,label,{type:format,step:'any',min:format==='number'?'0':'',placeholder:format==='text'?'Для разных дренажей одной локализации — разные обозначения':''});
 }).join('');
 const records=(p.studies||[]).filter(r=>r.type===type).slice().sort(sortByDateNewest);
 return `<details class="metric" data-panel="study:${esc(p.id)}:${esc(type)}"><summary>${esc(title)} <span class="muted">${records.length?`· ${records.length} запис.`:''}</span></summary>
 <div class="metric-body"><div data-draft-scope="${esc(scope)}">${input(scope,'date',type==='drain'?'Дата измерения':'Дата исследования',{type:'date',value:today()})}${type==='drain'?input(scope,'time','Время измерения',{type:'time'}):''}${fields}<div class="inline-actions">${btn('Сохранить запись','save-study',{pid:p.id,study:type})}${editingStudyId?btn('Отменить правку','cancel-study-edit',{},'btn ghost'):''}</div></div>
 ${records.map(r=>`<div class="resultrow"><div class="row between"><strong>${esc(r.date)} ${esc(r.time||'')}</strong><span class="muted">${esc(title)}</span></div>${Object.entries(r).filter(([k,v])=>!['id','type','date','time','createdAt','updatedAt'].includes(k)&&v!==''&&v!=null).map(([k,v])=>`<div class="muted">${esc(studyFields[type].find(f=>f[0]===k)?.[1]||k)}: <strong>${esc(v)}</strong></div>`).join('')}<div class="inline-actions">${btn('Изменить','edit-study',{pid:p.id,rid:r.id,study:type},'btn secondary small')}${btn('Удалить','delete-study',{pid:p.id,rid:r.id},'btn danger small')}</div></div>`).join('')}
 </div></details>`;
}
function renderStudies(p){
 const old=p.results.filter(r=>r.type==='study');
 return `<div class="sectionTitle">Инструментальные исследования</div><p class="muted">Дата исследования и числовые значения автоматически используются в «Динамике».</p>${STUDY_GROUPS.map(group=>`<details class="syscard collapsible" data-panel="study-group:${esc(p.id)}:${esc(group.id)}"><summary class="syshead">${esc(group.name)}</summary>${group.items.map(([type,title])=>studyForm(p,type,title)).join('')}${['gi','renal'].includes(group.id)?renderLegacyResultsForm(p,'study',group.id):''}</details>`).join('')}
 <details class="syscard"><summary class="syshead">Исследования из прежних версий (${old.length})</summary><p class="muted">Старые записи всех систем, включая удалённые из интерфейса группы, сохранены. Их можно просмотреть и удалить вручную.</p>${old.slice().sort(sortByDateNewest).map(r=>`<div class="resultrow"><strong>${esc(r.name)}</strong> · ${esc(r.date)}<div>${esc(r.value)}</div>${r.previous?`<div class="muted">Предыдущий: ${esc(r.previous)}</div>`:''}${r.comment?`<div class="muted">${esc(r.comment)}</div>`:''}${btn('Удалить','delete-result',{pid:p.id,rid:r.id},'btn danger small')}</div>`).join('')}</details>`;
}
function roundWeeklyRows(p){
 const anchor=new Date(weekAnchor+'T12:00:00');if(Number.isNaN(anchor.getTime()))return '';
 const day=(anchor.getDay()+6)%7;anchor.setDate(anchor.getDate()-day);
 const days=Array.from({length:7},(_,i)=>{const d=new Date(anchor);d.setDate(d.getDate()+i);return dateKey(d);});
 return `<div class="scroll-table"><table class="round-table"><thead><tr>${['Дата','АД','ЧСС','ЧДД','SpO₂','T°','Диурез','Поступило','Баланс','Стул',''].map(v=>`<th>${v}</th>`).join('')}</tr></thead><tbody>${days.flatMap(day=>{
   const rows=p.rounds.filter(r=>r.date===day).sort((a,b)=>String(a.time||'').localeCompare(String(b.time||'')));
   return rows.length?rows.map(r=>`<tr><th class="stick-date">${esc(day)} ${esc(r.time||'')}</th>${[r.bp,r.hr,r.rr,r.spo2,r.temp,r.urine,r.intake,r.periodHours&&numeric(r.urine)!==null&&numeric(r.intake)!==null?numeric(r.intake)-numeric(r.urine):'',r.stool].map(v=>`<td>${esc(v===undefined||v===null||v===''?'—':v)}</td>`).join('')}<td>${btn('Изменить','edit-round',{pid:p.id,rid:r.id},'btn secondary small')}</td></tr>`):[`<tr><th class="stick-date">${day}</th><td colspan="10" class="muted">Нет записи</td></tr>`];
 }).join('')}</tbody></table></div>`;
}
function renderRoundsV9(p){
 const scope=`round:${p.id}`;
 return `<div class="sectionTitle">Обход пациента</div><div class="card" data-draft-scope="${esc(scope)}"><div class="row between"><strong>${editingRoundId?'Редактирование обхода':'Новый обход'}</strong>${editingRoundId?btn('Отменить','cancel-round-edit',{},'btn ghost small'):''}</div>${input(scope,'date','Дата',{type:'date',value:today()})}${input(scope,'time','Время (если несколько измерений за день)',{type:'time'})}${input(scope,'periodHours','Период учёта жидкости, часы',{type:'number',min:'0',step:'any'})}<div class="grid">${roundFields.map(f=>input(scope,f.key,f.label,f)).join('')}</div><div class="inline-actions">${btn('Сохранить обход','add-round',{pid:p.id})}${btn('Добавить отдельное измерение','add-extra-round',{pid:p.id},'btn secondary')}</div><p class="muted">Обычное сохранение изменяет основную запись за выбранную дату. Для дополнительных измерений укажите время и используйте отдельную кнопку.</p></div>
 <div class="sectionTitle">Еженедельный обзор</div><div class="card"><div class="row between"><div class="grow"><label>Неделя, содержащая дату</label><input id="week-anchor" type="date" value="${esc(weekAnchor)}"></div>${btn('Сегодня','week-today',{},'btn ghost small')}</div>${roundWeeklyRows(p)}</div><div class="sectionTitle">Все обходы</div>${p.rounds.slice().sort(sortByDateNewest).map(r=>`<div class="resultrow"><span>${esc(r.date)} ${esc(r.time||'')} · АД ${esc(r.bp||'—')} · ЧСС ${esc(r.hr||'—')}</span><div class="inline-actions">${btn('Изменить','edit-round',{pid:p.id,rid:r.id},'btn secondary small')}${btn('Удалить','delete-round',{pid:p.id,rid:r.id},'btn danger small')}</div></div>`).join('')||'<div class="muted">Записей нет</div>'}`;
}
function renderDynamics(){
 const p=getPatient(graphPatient)||state.patients[0];
 if(!p)return '<div class="big">Динамика</div><div class="card empty">Сначала добавь пациента.</div>';
 const groups=seriesForPatient(p),opts=[['round','Обход'],['exam','Осмотр по системам'],['lab','Лаборатория'],['study','Инструментальные исследования']];
 const series=groups[dynamicsGroup]||[];
 if(!series.some(s=>s.key===dynamicsKey))dynamicsKey=series[0]?.key||'';
 const chosen=series.find(x=>x.key===dynamicsKey);
 return `<div class="big">Динамика</div><p class="muted">Только фактические измерения; пропущенные даты не интерполируются. Старые записи без указанной единицы показаны отдельно.</p><label>Пациент</label><select id="graph-patient">${state.patients.map(x=>`<option value="${esc(x.id)}" ${p.id===x.id?'selected':''}>${esc(x.name||'Пациент без имени')}</option>`).join('')}</select>
 <label>Источник</label><select id="dynamics-group">${opts.map(([k,v])=>`<option value="${k}" ${dynamicsGroup===k?'selected':''}>${v}</option>`).join('')}</select>
 <label>Показатель</label><select id="dynamics-metric">${series.map(s=>`<option value="${esc(s.key)}" ${s.key===dynamicsKey?'selected':''}>${esc(s.label)} (${esc(s.unit||'ед. не указана')})</option>`).join('')}</select>
 ${chosen?`<div class="card"><strong>${esc(chosen.label)}</strong><div class="muted">${esc(chosen.unit||'единица не указана')} · ${chosen.points.length} записей</div>${svgPlot(chosen.points,chosen.unit)}${chosen.points.map(x=>`<div class="resultrow"><strong>${esc(formatDateTime(x.date))}: ${esc(x.n)} ${esc(chosen.unit)}</strong>${x.meta?`<div class="muted">${esc(x.meta)}</div>`:''}</div>`).join('')}</div>`:'<div class="card empty">Для этой группы нет числовых измерений.</div>'}`;
}
function normalizeDrug(s){return String(s||'').toLocaleLowerCase('ru').replace(/\s+/g,' ').trim();}
function drugChoices(){return [...BUILTIN_DRUGS,...(state.drugCatalog||[])];}
function categorizeDrug(name){
 const needle=normalizeDrug(name);if(!needle)return '';
 const matches=drugChoices().filter(d=>[d.generic,d.trade].some(x=>normalizeDrug(x)===needle));
 return matches.length===1?matches[0].category||'':'';
}
const therapyFields=['generic','trade','category','categoryCustom','dose','unit','form','route','frequency','schedule','startDate','endDate','status','comment','reason','changedOn'];
function therapyEvent(p,existing,replacement,action='update',source='manual'){
 p.therapyHistory.push({id:id('th'),appointmentId:replacement?.id||existing?.id,action,effectiveDate:replacement?.changedOn||today(),changedAt:new Date().toISOString(),source,before:existing?structuredClone(existing):null,after:replacement?structuredClone(replacement):null});
}
function therapyAt(p,date){
 // Для старых записей без журнала их актуальное состояние видимо только сегодня.
 const out=new Map();
 const events=p.therapyHistory.slice().sort((a,b)=>String(a.effectiveDate||'').localeCompare(String(b.effectiveDate||''))||String(a.changedAt||'').localeCompare(String(b.changedAt||'')));
 for(const ev of events)if(ev.effectiveDate<=date){if(ev.after)out.set(ev.appointmentId,ev.after);else out.delete(ev.appointmentId);}
 return [...out.values()].filter(x=>x.status==='active'||x.status==='planned_stop');
}
function therapySource(p,token){
 if(token.startsWith('import:'))return p.therapySnapshots.find(s=>s.id===token.slice(7))?.items||[];
 if(token.startsWith('date:'))return therapyAt(p,token.slice(5));
 return [];
}
function compareTherapies(a,b){
 // Безопасное сопоставление только по устойчивому ID или однозначному МНН+путь+форма.
 const seen=new Set(),out=[];
 function matching(x){
  if(x.id){const f=a.find(z=>z.id===x.id);if(f)return f;}
  const key=normalizeDrug(x.generic)+'|'+normalizeDrug(x.form)+'|'+normalizeDrug(x.route);
  if(!normalizeDrug(x.generic)||!normalizeDrug(x.form)||!normalizeDrug(x.route))return null;
  const hits=a.filter(z=>normalizeDrug(z.generic)+'|'+normalizeDrug(z.form)+'|'+normalizeDrug(z.route)===key);
  return hits.length===1?hits[0]:null;
 }
 for(const next of b){const prev=matching(next);if(prev)seen.add(prev);const diff=prev?['dose','unit','route','frequency','schedule','startDate','endDate','status','form'].filter(k=>String(prev[k]||'')!==String(next[k]||'')):[];out.push({name:next.generic||next.trade||'Без названия',status:!prev?'Новое назначение':diff.length?'Изменено: '+diff.join(', '):'Без изменений',uncertain:!next.generic||!next.form||!next.route});}
 for(const prev of a)if(!seen.has(prev))out.push({name:prev.generic||prev.trade||'Без названия',status:'Отсутствует во втором наборе',uncertain:!prev.generic||!prev.form||!prev.route});
 return out;
}
function therapyWarnings(p){
 const warnings=[];
 for(const x of p.therapy.filter(x=>x.status==='active')){
  const missing=[['generic','МНН'],['dose','доза'],['unit','единица'],['route','путь введения'],['frequency','кратность']].filter(([k])=>!String(x[k]||'').trim());
  if(missing.length)warnings.push(`${x.generic||x.trade||'Назначение'}: не заполнены поля ${missing.map(x=>x[1]).join(', ')}.`);
 }
 const indexed=new Map();
 for(const d of p.therapy.filter(x=>x.status==='active'&&normalizeDrug(x.generic))){const k=[normalizeDrug(d.generic),normalizeDrug(d.form),normalizeDrug(d.route)].join('|');const prev=indexed.get(k);if(prev)warnings.push(`Возможный дубль: «${d.generic}» (проверь препараты и назначения вручную).`);else indexed.set(k,d);}
 return warnings;
}
function renderTherapy(p){
 const scope=`therapy:${p.id}`;
 const snapshotOptions=[...p.therapySnapshots.map(x=>[`import:${x.id}`,`Импорт: ${x.label} · ${x.date}`]), ...[...new Set([today(),...p.therapyHistory.map(h=>h.effectiveDate).filter(validDate)])].sort().reverse().map(d=>[`date:${d}`,`История на ${d}`])];
 const a=compareA||snapshotOptions.at(-1)?.[0]||'',b=compareB||snapshotOptions[0]?.[0]||'';
 const report=a&&b?compareTherapies(therapySource(p,a),therapySource(p,b)):[];
 const warnings=therapyWarnings(p);
 return `<div class="sectionTitle">Терапия</div><div class="card"><strong>${editingTherapyId?'Изменить назначение':'Новое назначение'}</strong>
 <div data-draft-scope="${esc(scope)}"><label>МНН или торговое наименование — поиск по справочнику</label><input data-key="generic" list="drug-names" value="${draft(scope,'generic')}" placeholder="МНН"><datalist id="drug-names">${drugChoices().map(x=>`<option value="${esc(x.generic||x.trade)}"></option>`).join('')}</datalist>
 ${input(scope,'trade','Торговое наименование')}
 ${select(scope,'category','Группа',[['','Без группы'],...THERAPY_GROUPS.map(x=>[x,x]),...([...new Set((state.drugCatalog||[]).map(x=>x.category))].filter(x=>x&&!THERAPY_GROUPS.includes(x)).map(x=>[x,x])),['__custom','Своя группа']])}
 ${input(scope,'categoryCustom','Если своя группа — введи название')}${btn('Подсказать группу по точному названию','suggest-category',{},'btn small secondary')}
 <div class="grid">${input(scope,'dose','Доза')}${input(scope,'unit','Единица измерения')}${input(scope,'form','Лекарственная форма')}${input(scope,'route','Путь введения')}${input(scope,'frequency','Кратность')}${input(scope,'schedule','Расписание')}${input(scope,'startDate','Начало',{type:'date',value:today()})}${input(scope,'endDate','Окончание',{type:'date'})}${input(scope,'changedOn','Дата изменения терапии',{type:'date',value:today()})}</div>
 ${select(scope,'status','Статус',THERAPY_STATUSES,'active')}${input(scope,'reason','Причина отмены / завершения (если есть)')}${textarea(scope,'comment','Комментарий')}
 <div class="inline-actions">${btn(editingTherapyId?'Сохранить изменения':'Добавить назначение','save-therapy',{pid:p.id})}${editingTherapyId?btn('Отменить редактирование','cancel-therapy-edit',{},'btn ghost'):''}</div></div></div>
 <div class="sectionTitle">Текущая терапия</div>${[...new Set([...THERAPY_GROUPS,...p.therapy.map(x=>x.category||'Без группы')])].map(cat=>{
  const items=p.therapy.filter(x=>(x.category||'Без группы')===cat&&['active','planned_stop'].includes(x.status));
  if(!items.length)return '';
  return `<details class="syscard collapsible" open><summary class="syshead">${esc(cat)} · ${items.length}</summary>${items.map(x=>`<div class="resultrow"><strong>${esc(x.generic||x.trade||'Без названия')}</strong>${x.trade?`<div class="muted">${esc(x.trade)}</div>`:''}<div>${esc([x.dose,x.unit,x.form,x.route,x.frequency,x.schedule].filter(Boolean).join(' · '))}</div><div class="muted">С ${esc(x.startDate||'—')} · ${esc(THERAPY_STATUSES.find(v=>v[0]===x.status)?.[1]||x.status)}</div><div class="inline-actions">${btn('Изменить','edit-therapy',{pid:p.id,rid:x.id},'btn secondary small')}${btn('Отменить','finish-therapy',{pid:p.id,rid:x.id,status:'cancelled'},'btn danger small')}${btn('Завершить курс','finish-therapy',{pid:p.id,rid:x.id,status:'completed'},'btn ghost small')}</div></div>`).join('')}</details>`;
 }).join('')||'<div class="muted">Активных назначений нет.</div>'}
 <details class="card"><summary><strong>Архив и журнал изменений (${p.therapyHistory.length})</strong></summary>${p.therapy.filter(x=>['cancelled','completed'].includes(x.status)).map(x=>`<div class="resultrow"><strong>${esc(x.generic||x.trade)}</strong> · ${esc(x.status)} ${btn('Возобновить','finish-therapy',{pid:p.id,rid:x.id,status:'active'},'btn secondary small')}</div>`).join('')}
 ${p.therapyHistory.slice().reverse().map(h=>`<div class="resultrow"><strong>${esc(formatDateTime(h.changedAt))}</strong> · ${esc(h.action)} · ${esc(h.after?.generic||h.before?.generic||h.after?.trade||h.before?.trade||'Назначение')}<div class="muted">Действует с ${esc(h.effectiveDate)} · источник ${esc(h.source||'ручной')}</div><details><summary class="muted">Изменения (старое → новое)</summary><pre class="event-diff">${esc(JSON.stringify(h.before,null,2))}\n→\n${esc(JSON.stringify(h.after,null,2))}</pre></details></div>`).join('')}</details>
 <details class="card" open><summary><strong>Сравнение двух дат / импортов</strong></summary><p class="muted">Сравниваются версии назначений из журнала либо вручную подтверждённые импортированные наборы.</p>
 <label>Первый набор</label><select id="compare-a">${snapshotOptions.map(([k,n])=>`<option value="${esc(k)}" ${k===a?'selected':''}>${esc(n)}</option>`).join('')}</select>
 <label>Второй набор</label><select id="compare-b">${snapshotOptions.map(([k,n])=>`<option value="${esc(k)}" ${k===b?'selected':''}>${esc(n)}</option>`).join('')}</select>
 ${report.map(r=>`<div class="resultrow"><strong>${esc(r.name)}</strong><div class="muted">${esc(r.status)}${r.uncertain?' · требует ручного сопоставления':''}</div></div>`).join('')||'<p class="muted">Недостаточно данных для сравнения.</p>'}</details>
 <details class="card" open><summary><strong>Импорт таблицы Excel или CSV</strong></summary><p class="muted">Импорт выполняется только после предварительного просмотра и подтверждения. Снимок не заменяет действующие назначения.</p>
 <div class="inline-actions">${btn('Импорт назначений','choose-therapy-file',{kind:'therapy'},'btn secondary small')}${btn('Импорт справочника','choose-therapy-file',{kind:'catalog'},'btn ghost small')}</div>${renderImportStage(p)}</details>
 <details class="card"><summary><strong>Предупреждения / проверка заполнения</strong></summary><p class="muted">Проверяются только незаполненные поля и возможные точные дубли. Лекарственные взаимодействия, противопоказания, коррекция доз при нарушениях функции органов и данные ГРЛС не проверяются: отсутствует валидированная база правил.</p>${warnings.map(s=>`<div class="alert">${esc(s)}</div>`).join('')||'<div class="muted">Включённых правил, выявивших проблему, нет. Это не означает, что терапия безопасна.</div>'}</details>`;
}
function renderImportStage(p){
 if(!importStage)return '';
 const sheet=importStage.sheets[importStage.index||0];if(!sheet)return '';
 const row=sheet.rows[0]||[];const scope='importmap';
 const fields=importKind==='catalog'?[['generic','МНН'],['trade','Торговое название'],['category','Группа']]:[['generic','МНН'],['trade','Торговое название'],['dose','Доза'],['unit','Единица'],['form','Форма'],['route','Путь введения'],['frequency','Кратность'],['schedule','Расписание'],['category','Группа']];
 const choices=[['','— не импортировать —'], ...row.map((v,i)=>[i,String(v||'Столбец '+(i+1)).slice(0,70)])];
 return `<div class="resultrow"><strong>${esc(importStage.filename)}</strong>${select('importsheet','sheet','Лист',importStage.sheets.map((s,i)=>[i,s.name]),String(importStage.index||0))}<div data-draft-scope="${scope}">${fields.map(([k,name])=>select(scope,k,name,choices, row.findIndex(v=>String(v).toLowerCase().includes(name.toLowerCase().split(' ')[0]))>=0?row.findIndex(v=>String(v).toLowerCase().includes(name.toLowerCase().split(' ')[0])):'' )).join('')}${importKind==='therapy'?input(scope,'date','Дата набора назначений',{type:'date',value:today()}):''}
 <div class="muted">Предпросмотр: ${sheet.rows.length-1} строк. Первые пять:</div><div class="scroll-table"><table class="round-table"><thead><tr>${row.map(v=>`<th>${esc(v)}</th>`).join('')}</tr></thead><tbody>${sheet.rows.slice(1,6).map(r=>`<tr>${row.map((_,i)=>`<td>${esc(r[i]||'')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
 <div class="inline-actions">${btn('Подтвердить импорт набора','confirm-sheet',{pid:p.id},'btn secondary')}${btn('Отменить','cancel-sheet',{},'btn ghost')}</div></div></div>`;
}

function addPatient() {
  const pid=id('p');
  state.patients.push({ id:pid, name:'', ward:'', diagnosis:'', active:true, created:today(), exam:{}, rounds:[], results:[], studies:[], therapy:[], therapyHistory:[], therapySnapshots:[], notes:'', systemNotes:{} });
  selected=pid;graphPatient=pid;patientTab='exam';changed();persist();render();
}
function addRound(pid,additional=false) {
  const p=getPatient(pid);if(!p)return;
  const keys=['date','time','periodHours',...roundFields.map(x=>x.key)];
  const values=draftValues(`round:${pid}`,keys);if(!values)return;
  if(!roundFields.some(x=>values[x.key])){msg('Заполни хотя бы один показатель');return;}
  if(values.bp&&!/^\d{2,3}\s*\/\s*\d{2,3}$/.test(values.bp)){msg('АД: ожидается формат 120/80');return;}
  if(values.periodHours&&(numeric(values.periodHours)===null||Number(values.periodHours)<=0)){msg('Период должен быть положительным');return;}
  if(additional&&!values.time){msg('Для дополнительного измерения укажи время');return;}
  const old=editingRoundId?p.rounds.find(x=>x.id===editingRoundId):(!additional?p.rounds.find(x=>x.date===values.date&&!x.additional):null);
  if(old){Object.assign(old,values);}
  else p.rounds.push({id:id('d'),...values,additional});
  editingRoundId=null;delete state.drafts[`round:${pid}`];changed();const ok=persist();render();msg(ok?'Обход сохранён':'Сохранение не удалось; экспортируй текущие данные');
}
function addResult(pid,type,system) {
  const p=getPatient(pid); if(!p)return;
  const scope=`result:${pid}:${type}:${system}`;
  const data=draftValues(scope,['name','custom','date','value','previous','flag','comment']);
  if(!data)return;
  if(!data.value) { msg('Введи результат или заключение'); return; }
  if(data.name==='__custom'&&!data.custom) { msg('Введи название показателя'); return; }
  p.results.push({id:id('r'),type,system,name:data.name==='__custom'?data.custom:data.name,date:data.date||today(),value:data.value,previous:data.previous,flag:data.flag,comment:data.comment});
  delete state.drafts[scope]; changed(); persist(); render(); msg('Результат добавлен');
}
function revealScope(scope){
 const el=[...app.querySelectorAll('[data-draft-scope]')].find(x=>x.dataset.draftScope===scope);
 if(!el)return;
 let parent=el.closest('details');while(parent){parent.open=true;parent=parent.parentElement?.closest('details');}
 el.scrollIntoView({block:'center',behavior:'instant'});
}
function saveExam(pid){
 const p=getPatient(pid);if(!p)return;
 const time=p.examDate||localDateTime();
 const existing=p.examHistory.find(x=>x.date===time);
 if(existing){existing.exam=structuredClone(p.exam);existing.updatedAt=new Date().toISOString();}
 else p.examHistory.push({id:id('ex'),date:time,exam:structuredClone(p.exam),createdAt:new Date().toISOString()});
 changed();persist();render();msg('Осмотр на дату сохранён');
}
function editRound(pid,rid){
 const p=getPatient(pid),r=p?.rounds.find(x=>x.id===rid);if(!r)return;
 editingRoundId=rid;state.drafts[`round:${pid}`]=Object.fromEntries(['date','time','periodHours',...roundFields.map(x=>x.key)].map(k=>[k,r[k]??'']));
 weekAnchor=r.date||today();render();revealScope(`round:${pid}`);
}
function saveLab(pid,mid){
 const p=getPatient(pid),metric=LAB_BY_ID[mid];if(!p||!metric)return;
 const scope=`lab:${pid}:${mid}`;
 const d=draftValues(scope,['date','time','value','unit','method','specimen','comment']);if(!d)return;
 const val=numeric(d.value);
 if(val===null||(!metric.allowNegative&&val<0)){msg('Введите допустимый числовой результат');return;}
 if(!validDate(d.date)){msg('Укажи дату исследования');return;}
 const unit=metric.unit||d.unit;if(!unit&&mid!=='inr'&&mid!=='ph'){msg('Не указана единица измерения');return;}
 const ref=labReference(mid);const hasLimits=ref.low!==''&&ref.low!=null||ref.high!==''&&ref.high!=null;
 // Настройки референса применяются только при точном совпадении метода/биоматериала.
 const matched=hasLimits&&ref.method&&ref.specimen&&ref.method===d.method&&ref.specimen===d.specimen&&(!ref.sex||ref.sex===p.sex);
 const entry={type:'lab',metricId:mid,system:LAB_GROUPS.find(g=>g.metrics.includes(mid))?.id||'other',name:metric.name,
  date:d.date,time:d.time,numericValue:val,value:String(val),unit,method:d.method,specimen:d.specimen,
  comment:d.comment,referenceSnapshot:matched?{low:ref.low,high:ref.high,method:ref.method,specimen:ref.specimen,sex:ref.sex||'',capturedAt:new Date().toISOString()}:null};
 let old=editingLabId?p.results.find(x=>x.id===editingLabId):null;
 if(old&&legacyMetricId(old)!==mid)old=null;
 if(old){Object.assign(old,entry,{updatedAt:new Date().toISOString()});}
 else p.results.push({id:id('r'),createdAt:new Date().toISOString(),...entry});
 editingLabId=null;delete state.drafts[scope];changed();persist();render();msg('Лабораторный результат сохранён');
}
function editLab(pid,rid,mid){
 const p=getPatient(pid),r=p?.results.find(x=>x.id===rid);if(!r)return;
 const scope=`lab:${pid}:${mid}`;const parsed=parseNumeric(r.value);
 state.drafts[scope]={date:r.date||today(),time:r.time||'',value:String(r.numericValue??parsed?.n??''),unit:r.unit||parsed?.unit||'',method:r.method||'',specimen:r.specimen||LAB_BY_ID[mid]?.specimen||'',comment:r.comment||''};
 editingLabId=rid;render();revealScope(scope);
}
function saveLabRef(mid){
 const scope=`labref:${mid}`,d=draftValues(scope,['low','high','method','specimen','sex']);if(!d)return;
 const lo=numeric(d.low),hi=numeric(d.high);
 if((d.low!==''&&lo===null)||(d.high!==''&&hi===null)||(lo!==null&&hi!==null&&lo>hi)){msg('Некорректные границы референса');return;}
 state.labRefs[mid]={...d,updatedAt:new Date().toISOString()};changed();persist();msg('Референс сохранён для будущих результатов');
}
function saveStudy(pid,type){
 const p=getPatient(pid);if(!p||!studyFields[type])return;
 const scope=`study:${pid}:${type}`,keys=['date','time',...studyFields[type].map(x=>x[0])];
 const d=draftValues(scope,keys);if(!d)return;
 if(!validDate(d.date)){msg('Нужна дата исследования');return;}
 if(type==='drain'&&!d.drainLabel){msg('Назови дренаж для различения нескольких дренажей одной локализации');return;}
 for(const [key,label,format] of studyFields[type])if(format==='number'&&d[key]!==''&&(numeric(d[key])===null||Number(d[key])<0)){msg('Некорректное значение: '+label);return;}
 if(type==='ecg'&&d.rhythm==='Другой'&&!d.otherRhythm){msg('Укажи другой ритм');return;}
 if(!studyFields[type].some(([k])=>String(d[k]||'').trim())&&!['xray','ct'].includes(type)){msg('Заполни хотя бы одно поле');return;}
 const normalized={};for(const [key,,format] of studyFields[type])normalized[key]=format==='number'?(d[key]===''?'':numeric(d[key])):d[key];
 const fields={type,date:d.date,time:d.time||'',...normalized};
 const existing=editingStudyId?p.studies.find(x=>x.id===editingStudyId&&x.type===type):null;
 if(existing){Object.assign(existing,fields,{updatedAt:new Date().toISOString()});}
 else p.studies.push({id:id('s'),createdAt:new Date().toISOString(),...fields});
 editingStudyId=null;delete state.drafts[scope];changed();persist();render();msg('Исследование сохранено');
}
function editStudy(pid,rid,type){
 const p=getPatient(pid),r=p?.studies.find(x=>x.id===rid&&x.type===type);if(!r)return;
 editingStudyId=rid;const scope=`study:${pid}:${type}`;
 state.drafts[scope]=Object.fromEntries(['date','time',...studyFields[type].map(f=>f[0])].map(k=>[k,r[k]??'']));render();revealScope(scope);
}
function saveTherapy(pid){
 const p=getPatient(pid),scope=`therapy:${pid}`,d=draftValues(scope,therapyFields);if(!p||!d)return;
 if(!d.generic&&!d.trade){msg('Укажи препарат');return;}
 if(!validDate(d.changedOn)){msg('Укажи дату изменения');return;}
 if(!THERAPY_STATUSES.some(x=>x[0]===d.status)){msg('Выбери статус');return;}
 if(d.category==='__custom')d.category=d.categoryCustom.trim();
 const prev=editingTherapyId?p.therapy.find(x=>x.id===editingTherapyId):null;
 const next={...(prev||{}),...d,id:prev?.id||id('med'),category:d.category||'Без группы',updatedAt:new Date().toISOString(),source:'manual'};
 if(prev){const before=structuredClone(prev);Object.assign(prev,next);therapyEvent(p,before,next,'update');}
 else {p.therapy.push(next);therapyEvent(p,null,next,'add');}
 editingTherapyId=null;delete state.drafts[scope];changed();persist();render();msg('Назначение сохранено');
}
function editTherapy(pid,rid){
 const p=getPatient(pid),r=p?.therapy.find(x=>x.id===rid);if(!r)return;
 editingTherapyId=rid;state.drafts[`therapy:${pid}`]=Object.fromEntries(therapyFields.map(k=>[k,r[k]??'']));render();revealScope(`therapy:${pid}`);
}
function finishTherapy(pid,rid,newStatus){
 const p=getPatient(pid),r=p?.therapy.find(x=>x.id===rid);if(!r)return;
 const name=r.generic||r.trade;
 if(!confirm(`Изменить статус назначения «${name}»?`))return;
 const reason=prompt('Причина (необязательно):','');if(reason===null)return;
 const before=structuredClone(r);
 r.status=newStatus;r.reason=reason;r.changedOn=today();r.updatedAt=new Date().toISOString();
 therapyEvent(p,before,r,newStatus);changed();persist();render();
}
function importMapped(pid){
 const p=getPatient(pid),sheet=importStage?.sheets[importStage.index||0];if(!p||!sheet)return;
 const keys=importKind==='catalog'?['generic','trade','category']:['generic','trade','dose','unit','form','route','frequency','schedule','category'];
 const data=draftValues('importmap',importKind==='catalog'?keys:[...keys,'date']);if(!data)return;
 if(data.generic===''&&data.trade===''){msg('Сопоставь столбец с МНН или торговым наименованием');return;}
 const rows=sheet.rows.slice(1).filter(r=>r.some(x=>String(x||'').trim())).map(r=>Object.fromEntries(keys.map(k=>[k,data[k]!==''?String(r[Number(data[k])]??'').trim():'']))).filter(x=>x.generic||x.trade);
 if(!rows.length){msg('Не обнаружены назначения в сопоставленных столбцах');return;}
 if(!confirm(`Подтвердить импорт ${rows.length} строк из листа «${sheet.name}»? Текущая терапия не будет перезаписана.`))return;
 if(importKind==='catalog'){
   state.drugCatalog=[...(state.drugCatalog||[]),...rows.map((x,i)=>({...x,id:id('drug'),source:'user',importedAt:new Date().toISOString()}))];
 }else{
   if(!validDate(data.date)){msg('Укажи дату набора');return;}
   p.therapySnapshots.push({id:id('snap'),date:data.date,label:`${importStage.filename} — ${sheet.name}`,items:rows.map((x,i)=>({...x,id:id('imp'),status:'active',source:'import'})),importedAt:new Date().toISOString()});
 }
 importStage=null;delete state.drafts.importmap;changed();const ok=persist();render();msg(ok?'Набор импортирован; активная терапия не изменена':'Сохранение не удалось; экспортируй данные');
}

function addTask() {
  const d=draftValues('task',['title','date','pid']); if(!d)return;
  if(!d.title) { msg('Введи название задачи'); return; }
  state.tasks.push({id:id('t'),title:d.title,date:d.date||today(),pid:d.pid,done:false});
  delete state.drafts.task; changed(); persist(); render();
}
function addEvent() {
  const d=draftValues('event',['title','date','pid']); if(!d)return;
  if(!d.title) { msg('Введи название события'); return; }
  const date=d.date||today();
  state.events.push({id:id('e'),title:d.title,date,pid:d.pid});
  selectedCalendarDate=date; calendarMonth=new Date(Number(date.slice(0,4)),Number(date.slice(5,7))-1,1);
  delete state.drafts.event; changed(); persist(); render();
}
function removePatient(pid) {
  const p=getPatient(pid); if(!p)return;
  const linked = state.tasks.filter(t=>String(t.pid)===pid).length + state.events.filter(t=>String(t.pid)===pid).length;
  if(!confirm(`Удалить пациента «${p.name||'Без имени'}», все обходы, результаты и ${linked} связанных задач/событий? Отменить действие нельзя.`))return;
  state.patients=state.patients.filter(x=>String(x.id)!==pid);
  state.tasks=state.tasks.filter(x=>String(x.pid)!==pid);
  state.events=state.events.filter(x=>String(x.pid)!==pid);
  for (const key of Object.keys(state.drafts)) if(key===`round:${pid}`||key===`therapy:${pid}`||key.startsWith(`result:${pid}:`)||key.startsWith(`lab:${pid}:`)||key.startsWith(`study:${pid}:`))delete state.drafts[key];
  selected=null; changed(); persist(); render();
}
function removeItem(kind,rid) {
  if(!confirm('Удалить эту запись?'))return;
  if(kind==='task') state.tasks=state.tasks.filter(x=>String(x.id)!==rid);
  else if(kind==='event') state.events=state.events.filter(x=>String(x.id)!==rid);
  else return;
  changed(); persist(); render();
}
function download(name,content,contentType) {
  const href=URL.createObjectURL(new Blob([content],{type:contentType}));
  const a=document.createElement('a');a.href=href;a.download=name;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(href),1000);
}
function exportData() { persist(); download(`ordinator-backup-${today()}.json`,createBackup(state),'application/json;charset=utf-8'); }
function rawBackup() {
  let source;
  try { source=localStorage.getItem(STORAGE_KEY); } catch(e) { msg('Невозможно прочитать хранилище'); return; }
  if(source===null) { msg('Старых данных в хранилище нет'); return; }
  download(`ordinator-raw-${today()}.txt`,source,'text/plain;charset=utf-8');
}
async function importData(file) {
  if(!file)return;
  if(file.size>10*1024*1024) { alert('Файл больше 10 МБ — импорт отменён.'); return; }
  try {
    const replacement=readBackup(await file.text());
    if(!confirm(`Заменить все текущие данные? В копии: пациентов — ${replacement.patients.length}, задач — ${replacement.tasks.length}, событий — ${replacement.events.length}. Создай резервную копию текущих данных перед продолжением.`))return;
    // Сначала успешная запись в localStorage, затем смена состояния в интерфейсе.
    saveData(replacement);
    clearTimeout(saveTimer); saveTimer=null;
    state=replacement; storageError=null; selected=null; graphPatient=null;
    updateStorageAlert(); status.textContent='✓ Восстановлено'; render(); msg('Копия восстановлена');
  } catch(error) { alert('Не удалось импортировать резервную копию: '+error.message); }
}

document.addEventListener('toggle',event=>{const el=event.target;if(el instanceof HTMLDetailsElement && el.dataset.panel)expandedPanels.set(el.dataset.panel,el.open);},true);
document.addEventListener('input', event => {
  const field=event.target;
  if(!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement))return;
  if(field.dataset.patientCheck!==undefined&&selected){const p=getPatient(selected);if(p){p[field.dataset.patientCheck]=field.checked;changed();}return;}
  if(field.dataset.patientField !== undefined && selected) {
    const p=getPatient(selected); if(!p)return;
    p[field.dataset.patientField]=field.value; changed(); return;
  }
  if(field.dataset.examSystem && selected) {
    const p=getPatient(selected); if(!p)return;
    const sys=field.dataset.examSystem, key=field.dataset.examKey;
    if(!p.exam[sys] || typeof p.exam[sys]!=='object')p.exam[sys]={};
    p.exam[sys][key]=field.value; changed(); return;
  }
  const scope=field.closest('[data-draft-scope]')?.dataset.draftScope;
  if(scope && field.dataset.key) {
    state.drafts[scope] ??= {};
    state.drafts[scope][field.dataset.key]=field.value;
    changed();
    if(scope.startsWith('lab:')&&(field.dataset.key==='date'||field.dataset.key==='time')){
      const [,pid,mid]=scope.split(':');const p=getPatient(pid),date=state.drafts[scope]?.date||today(),time=state.drafts[scope]?.time||'';
      const prev=p?getPreviousLab(p,mid,date,time,editingLabId||''):null;
      const el=[...app.querySelectorAll('[data-prev-metric]')].find(x=>x.dataset.prevMetric===mid&&x.dataset.prevPid===pid);
      if(el)el.textContent='Предыдущий результат: '+(prev?`${prev.numericValue??prev.value} ${prev.unit||''} — ${prev.date}${prev.time?' '+prev.time:''}`:'Предыдущих результатов нет')+'. На '+date+': '+(p?getLabResults(p,mid).filter(r=>r.date===date).map(r=>`${r.numericValue??r.value} ${r.unit||''}${r.time?' в '+r.time:''}`).join('; ')||'записей нет':'записей нет');
    }
  }
});
// change обязателен для select и выбора даты; input поддерживается браузерами не везде одинаково.
document.addEventListener('change', event => {
  const el=event.target;
  if(el.matches('[data-toggle-task]')) {
    const t=state.tasks.find(t=>String(t.id)===el.dataset.toggleTask);
    if(t) { t.done=el.checked; changed(); persist(); render(); }
    return;
  }
  if(el.id==='graph-patient'){graphPatient=el.value;dynamicsKey='';render();return;}
  if(el.id==='dynamics-group'){dynamicsGroup=el.value;dynamicsKey='';render();return;}
  if(el.id==='dynamics-metric'){dynamicsKey=el.value;render();return;}
  if(el.id==='week-anchor'){weekAnchor=el.value;render();return;}
  if(el.id==='compare-a'){compareA=el.value;render();return;}
  if(el.id==='compare-b'){compareB=el.value;render();return;}
  if(importStage&&el.dataset.key==='sheet'&&el.closest('.resultrow')){importStage.index=Number(el.value);delete state.drafts.importmap;render();return;}
  if(el.matches('[data-patient-check]')){el.dispatchEvent(new Event('input',{bubbles:true}));return;}
  if(el.matches('[data-key],[data-patient-field],[data-exam-system]')) {
    el.dispatchEvent(new Event('input',{bubbles:true}));
  }
});

document.addEventListener('click', event => {
  const target=event.target.closest('button[data-action]');
  if(!target)return;
  const {action,pid,rid,tab,system,type,kind,delta,date}=target.dataset;
  if(!action)return;
  switch(action) {
    case 'page':persist();selected=null;page=target.dataset.page==='walk'?'patients':target.dataset.page;render();break;
    case 'new-patient': addPatient();break;
    case 'open-patient':persist();selected=pid;graphPatient=pid;patientTab=tab||'exam';render();break;
    case 'close-patient': persist();selected=null;render();break;
    case 'patient-tab':persist();patientTab=tab;editingLabId=null;editingStudyId=null;editingTherapyId=null;editingRoundId=null;render();break;
    case 'save': persist();msg(storageError?'Сохранение не удалось':'Данные сохранены');break;
    case 'add-round': addRound(pid);break;
    case 'add-extra-round':addRound(pid,true);break;
    case 'edit-round':editRound(pid,rid);break;
    case 'cancel-round-edit':editingRoundId=null;delete state.drafts[`round:${selected}`];render();break;
    case 'week-today':weekAnchor=today();render();break;
    case 'save-exam':saveExam(pid);break;
    case 'delete-exam':{const p=getPatient(pid);if(p&&confirm('Удалить запись осмотра?')){p.examHistory=p.examHistory.filter(x=>x.id!==rid);changed();persist();render();}break;}
    case 'save-lab':saveLab(pid,target.dataset.mid);break;
    case 'edit-lab':editLab(pid,rid,target.dataset.mid);break;
    case 'cancel-lab-edit':editingLabId=null;render();break;
    case 'save-lab-ref':saveLabRef(target.dataset.mid);break;
    case 'save-study':saveStudy(pid,target.dataset.study);break;
    case 'edit-study':editStudy(pid,rid,target.dataset.study);break;
    case 'cancel-study-edit':editingStudyId=null;render();break;
    case 'delete-study':{const p=getPatient(pid);if(p&&confirm('Удалить исследование?')){p.studies=p.studies.filter(x=>x.id!==rid);changed();persist();render();}break;}
    case 'save-therapy':saveTherapy(pid);break;
    case 'edit-therapy':editTherapy(pid,rid);break;
    case 'cancel-therapy-edit':editingTherapyId=null;delete state.drafts[`therapy:${selected}`];render();break;
    case 'finish-therapy':finishTherapy(pid,rid,target.dataset.status);break;
    case 'suggest-category':{const form=app.querySelector(`[data-draft-scope="therapy:${selected}"]`),name=form?.querySelector('[data-key=generic]')?.value||form?.querySelector('[data-key=trade]')?.value;const cat=categorizeDrug(name);if(!cat){msg('Однозначного совпадения в справочнике нет');break;}const selectEl=form.querySelector('[data-key=category]');if(selectEl){selectEl.value=[...selectEl.options].some(x=>x.value===cat)?cat:'__custom';selectEl.dispatchEvent(new Event('input',{bubbles:true}));if(selectEl.value==='__custom'){const custom=form.querySelector('[data-key=categoryCustom]');custom.value=cat;custom.dispatchEvent(new Event('input',{bubbles:true}));}}msg('Предложена группа: '+cat);break;}
    case 'choose-therapy-file':importKind=target.dataset.kind;document.getElementById('therapy-file').click();break;
    case 'confirm-sheet':importMapped(pid);break;
    case 'cancel-sheet':importStage=null;render();break;
    case 'delete-round': {
      const p=getPatient(pid);if(p&&confirm('Удалить запись обхода?')) {p.rounds=p.rounds.filter(r=>String(r.id)!==rid);changed();persist();render();}
      break;
    }
    case 'add-result': addResult(pid,type,system);break;
    case 'delete-result': {
      const p=getPatient(pid);if(p&&confirm('Удалить результат?')) {p.results=p.results.filter(r=>String(r.id)!==rid);changed();persist();render();}
      break;
    }
    case 'delete-patient': removePatient(pid);break;
    case 'add-task': addTask();break;
    case 'add-event': addEvent();break;
    case 'delete-item': removeItem(kind,rid);break;
    case 'calendar-month':calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+Number(delta),1);render();break;
    case 'calendar-select':selectedCalendarDate=date;state.drafts.event ??= {};state.drafts.event.date=date;changed();render();break;
    case 'export':exportData();break;
    case 'raw-backup':rawBackup();break;
    case 'import':backupInput.click();break;
    default:break;
  }
});
document.getElementById('therapy-file').addEventListener('change',async function(){
 const f=this.files?.[0];this.value='';if(!f)return;try{importStage={filename:f.name,sheets:await readTables(f),index:0};delete state.drafts.importmap;render();const el=app.querySelector('#compare-a');if(el){}const panel=[...app.querySelectorAll('details')].find(x=>x.textContent.includes('Импорт таблицы Excel'));if(panel)panel.open=true;msg('Выбери лист и сопоставь столбцы');}catch(e){alert('Не удалось прочитать файл: '+e.message);} });
backupInput.addEventListener('change',async () => { await importData(backupInput.files?.[0]); backupInput.value=''; });
window.addEventListener('pagehide',persist);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')persist();});
window.addEventListener('storage',event=>{
  if(event.key!==STORAGE_KEY)return;
  // Нельзя незаметно перезаписать данные из другой открытой вкладки.
  storageError='Данные были изменены в другой вкладке. Экспортируйте текущую копию и перезагрузите страницу перед продолжением.';
  updateStorageAlert();status.textContent='Конфликт вкладок';
});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
updateStorageAlert();render();

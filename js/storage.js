// ВАЖНО: используем исходный ключ, чтобы не терять данные ранее установленной версии.
export const STORAGE_KEY = 'ord_v3';
export const SCHEMA_VERSION = 6;

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const emptyState = () => ({ schemaVersion: SCHEMA_VERSION, patients: [], tasks: [], events: [], drafts: {} });

export function normalizeState(raw) {
  if (!isObject(raw) || !Array.isArray(raw.patients) || !Array.isArray(raw.tasks) || !Array.isArray(raw.events)) {
    throw new Error('Неподдерживаемый формат данных: необходимы массивы patients, tasks, events.');
  }
  if (Number(raw.schemaVersion || 0) > SCHEMA_VERSION) {
    throw new Error('Данные созданы более новой версией приложения. Обновите приложение перед импортом.');
  }
  // Не теряем некорректные строки молча: сначала предложим экспорт исходного JSON.
  if ([...raw.patients, ...raw.tasks, ...raw.events].some(item => !isObject(item))) {
    throw new Error('В данных есть повреждённые записи. Исходный JSON не перезаписывается.');
  }
  const value = { ...raw, schemaVersion: SCHEMA_VERSION };
  if (raw.patients.some(p => (p.rounds && (!Array.isArray(p.rounds) || p.rounds.some(x => !isObject(x)))) ||
                               (p.results && (!Array.isArray(p.results) || p.results.some(x => !isObject(x)))))) {
    throw new Error('Список обходов или результатов содержит некорректные записи.');
  }
  value.patients = raw.patients.map(p => ({
    ...p,
    id: String(p.id ?? ''),
    name: String(p.name ?? ''),
    ward: String(p.ward ?? ''),
    diagnosis: String(p.diagnosis ?? ''),
    notes: String(p.notes ?? ''),
    created: String(p.created ?? ''),
    exam: isObject(p.exam) ? p.exam : {},
    rounds: Array.isArray(p.rounds) ? p.rounds : [],
    results: Array.isArray(p.results) ? p.results : [],
    examHistory: Array.isArray(p.examHistory) ? p.examHistory : [],
    studies: Array.isArray(p.studies) ? p.studies : [],
    therapy: Array.isArray(p.therapy) ? p.therapy : [],
    therapyHistory: Array.isArray(p.therapyHistory) ? p.therapyHistory : [],
    therapySnapshots: Array.isArray(p.therapySnapshots) ? p.therapySnapshots : [],
    systemNotes: isObject(p.systemNotes) ? p.systemNotes : {},
  }));
  value.tasks = raw.tasks;
  value.events = raw.events;
  // Черновики — словарь простых значений, а не HTML/код.
  value.drafts = isObject(raw.drafts) ? raw.drafts : {};
  value.labRefs = isObject(raw.labRefs) ? raw.labRefs : {};
  value.drugCatalog = Array.isArray(raw.drugCatalog) ? raw.drugCatalog : [];
  value.libraryDrugs = Array.isArray(raw.libraryDrugs) ? raw.libraryDrugs : [];
  return value;
}

export function loadData() {
  try {
    const original = localStorage.getItem(STORAGE_KEY);
    if (original === null) return { state: emptyState(), error: null };
    return { state: normalizeState(JSON.parse(original)), error: null };
  } catch (error) {
    return { state: emptyState(), error: 'Не удалось прочитать локальные данные. Сохранение приостановлено, чтобы не затереть старые записи. ' + error.message };
  }
}

export function saveData(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function createBackup(state) {
  return JSON.stringify({ app: 'ordinator', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), data: state }, null, 2);
}

export function readBackup(json) {
  const payload = JSON.parse(json);
  if (!isObject(payload) || payload.app !== 'ordinator' || !isObject(payload.data)) {
    throw new Error('Это не резервная копия «Ординатора».');
  }
  return normalizeState(payload.data);
}

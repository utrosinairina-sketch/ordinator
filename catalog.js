// Справочники и поля форм. Новые медицинские показатели добавляйте здесь,
// а не в обработчики сохранения/загрузки.
export const systems = [
  { id: 'general', name: 'Общее состояние' },
  { id: 'cardio', name: 'Сердечно-сосудистая система' },
  { id: 'resp', name: 'Дыхательная система' },
  { id: 'gi', name: 'ЖКТ' },
  { id: 'renal', name: 'Мочевыделительная система' },
  { id: 'neuro', name: 'Нервная система' },
  { id: 'wound', name: 'Рана и дренажи' },
  { id: 'hemostasis', name: 'Кровь и гемостаз' },
  { id: 'other', name: 'Прочее' },
];
export const labBySystem = {
  general: ['ОАК: Hb', 'ОАК: лейкоциты', 'ОАК: тромбоциты', 'СРБ', 'Прокальцитонин', 'Глюкоза'],
  cardio: ['Тропонин', 'NT-proBNP', 'Na⁺', 'K⁺', 'Mg²⁺', 'Ca²⁺'],
  resp: ['КЩС: pH', 'КЩС: pCO₂', 'КЩС: лактат'],
  gi: ['АЛТ / АСТ', 'Билирубин', 'Глюкоза'],
  renal: ['Креатинин', 'Мочевина', 'Na⁺', 'K⁺', 'Mg²⁺', 'Ca²⁺'],
  neuro: ['Другое'],
  wound: ['СРБ', 'Прокальцитонин', 'ОАК: лейкоциты'],
  hemostasis: ['ОАК: Hb', 'ОАК: тромбоциты', 'МНО / ПВ', 'АЧТВ', 'Фибриноген'],
  other: ['Другое'],
};
export const studyBySystem = {
  general: ['Другое исследование'],
  cardio: ['ЭКГ', 'ЭхоКГ: ФВ ЛЖ', 'ЭхоКГ: клапаны / протезы', 'ЭхоКГ: правые отделы / давление', 'Холтер', 'ФВЛГ / другое'],
  resp: ['Рентген грудной клетки', 'КТ'],
  gi: ['УЗИ / допплерография', 'КТ'],
  renal: ['УЗИ / допплерография', 'КТ'],
  neuro: ['КТ', 'Другое исследование'],
  wound: ['УЗИ / допплерография', 'Другое исследование'],
  hemostasis: ['Другое исследование'],
  other: ['Другое исследование'],
};
export const examFields = [
  { id: 'cardio', name: 'Сердечно-сосудистая система', items: [
    { key: 'АД', label: 'АД', placeholder: 'Например: 120/70 мм рт. ст.' },
    { key: 'ЧСС', label: 'ЧСС', placeholder: 'уд/мин' },
    { key: 'Тоники', label: 'Тоники — препараты и параметры', placeholder: 'Препарат, доза, скорость инфузии' },
    { key: 'ЭКС', label: 'ЭКС — режим и параметры', placeholder: 'Режим, частота, mA / напряжение, чувствительность' },
  ]},
  { id: 'resp', name: 'Дыхательная система', items: [
    { key: 'ЧДД', label: 'ЧДД', placeholder: 'дых/мин' },
    { key: 'Сатурация', label: 'Сатурация (SpO₂)', placeholder: '%, кислородная поддержка' },
  ]},
  { id: 'renal', name: 'Баланс жидкости', items: [
    { key: 'Баланс жидкости', label: 'Баланс жидкости за период', placeholder: 'Поступило, выделено, диурез и итоговый баланс в мл' },
  ]},
];
export const roundFields = [
  { key: 'bp', label: 'АД, мм рт. ст.', placeholder: '120/80' },
  { key: 'hr', label: 'ЧСС, уд/мин', placeholder: '80', type: 'number', min: '0', max: '350' },
  { key: 'rr', label: 'ЧДД, в мин', placeholder: '16', type: 'number', min: '0', max: '150' },
  { key: 'spo2', label: 'SpO₂, %', placeholder: '98', type: 'number', min: '0', max: '100', step: '0.1' },
  { key: 'urine', label: 'Диурез, мл', placeholder: '1500', type: 'number', min: '0', step: 'any' },
  { key: 'intake', label: 'Выпито / поступило, мл', placeholder: '2000', type: 'number', min: '0', step: 'any' },
  { key: 'temp', label: 'Температура, °C', placeholder: '36.6', type: 'number', min: '0', max: '50', step: '0.1' },
  { key: 'stool', label: 'Стул', placeholder: 'Был / не было' },
];

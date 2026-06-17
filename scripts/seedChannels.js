// ════════════════════════════════════════════════════════════════════════
// Стартовый список телеканалов, для которых робот ищет расписание.
// Это НЕ расписание и не моки — только названия и поисковые синонимы,
// по которым робот сам найдёт реальные источники в интернете.
// Новые каналы робот добавляет сюда автоматически (см. discovery.js) —
// при перезапуске они сохраняются в data/known-channels.json.
// ════════════════════════════════════════════════════════════════════════

export const SEED_CHANNELS = [
  { id: "perviy", name: "Первый канал", aliases: ["1tv", "первый", "1 канал", "channel one", "орт"], group: "Федеральные" },
  { id: "rossiya1", name: "Россия 1", aliases: ["russia1", "россия 1", "вести", "russia tv"], group: "Федеральные" },
  { id: "ntv", name: "НТВ", aliases: ["ntv", "нтв"], group: "Федеральные" },
  { id: "ctc", name: "СТС", aliases: ["ctc", "стс"], group: "Федеральные" },
  { id: "ren", name: "РЕН ТВ", aliases: ["rentv", "рен", "ren tv"], group: "Федеральные" },
  { id: "tnt", name: "ТНТ", aliases: ["tnt", "тнт"], group: "Федеральные" },
  { id: "5tv", name: "Пятый канал", aliases: ["5tv", "пятый канал", "5 канал"], group: "Федеральные" },
  { id: "tvc", name: "ТВ Центр", aliases: ["tvc", "тв центр", "tvcenter"], group: "Федеральные" },
  { id: "otr", name: "ОТР", aliases: ["otr", "отр"], group: "Федеральные" },
  { id: "zvezda", name: "Звезда", aliases: ["zvezda", "звезда тв"], group: "Федеральные" },
  { id: "tv3", name: "ТВ-3", aliases: ["tv3", "тв3", "тв-3"], group: "Развлечения" },
  { id: "subbota", name: "Суббота!", aliases: ["subbota", "суббота"], group: "Развлечения" },
  { id: "domkino", name: "Дом Кино", aliases: ["domkino", "дом кино"], group: "Кино" },
  { id: "karusel", name: "Карусель", aliases: ["karusel", "карусель"], group: "Детские" },
  { id: "nauka", name: "Наука", aliases: ["nauka tv", "наука"], group: "Познание" },
  { id: "muztv", name: "МУЗ-ТВ", aliases: ["muztv", "муз тв", "муз-тв"], group: "Музыка" },
  { id: "matchtv", name: "Матч! ТВ", aliases: ["matchtv", "матч тв", "match tv"], group: "Спорт" },
  { id: "russia24", name: "Россия 24", aliases: ["russia24", "россия 24"], group: "Новости" },
  { id: "domashniy", name: "Домашний", aliases: ["domashniy", "домашний"], group: "Развлечения" },
  { id: "friday", name: "Пятница!", aliases: ["friday tv", "пятница"], group: "Развлечения" },
  { id: "kultura", name: "Россия Культура", aliases: ["russia k", "культура"], group: "Познание" },
  { id: "tnt4", name: "ТНТ4", aliases: ["tnt4", "тнт4"], group: "Развлечения" },
  { id: "2x2", name: "2x2", aliases: ["2x2"], group: "Детские" },
  { id: "mir", name: "Мир", aliases: ["mirtv", "мир тв"], group: "Федеральные" },
  { id: "spas", name: "Спас", aliases: ["spas tv", "спас"], group: "Познание" },
];

// ════════════════════════════════════════════════════════════════════════
// Авто-обнаружение новых каналов.
// Источники реальные: список каналов из XMLTV-агрегатора и полный каталог
// каналов Яндекс.ТВ. Робот сравнивает названия с уже известными (seed +
// ранее найденные) и добавляет те, которых ещё нет — с настоящим
// названием и настоящим внешним id, без выдумывания.
// ════════════════════════════════════════════════════════════════════════

import { log } from "../lib/log.js";

function normalize(name) {
  return name
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, " ")
    .trim();
}

function slugify(name, fallbackIndex) {
  const translit = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
    и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
    с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "c", ч: "ch", ш: "sh", щ: "sch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  const ascii = name
    .toLowerCase()
    .split("")
    .map((ch) => translit[ch] ?? ch)
    .join("");
  const slug = ascii
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  return slug || `channel_${fallbackIndex}`;
}

function autoGroup(name) {
  const n = name.toLowerCase();
  if (/новост|news|вести|24|rtvi|euronews|cnn|bbc/.test(n)) return "Новости";
  if (/спорт|sport|матч|match|футбол|хоккей|бокс/.test(n)) return "Спорт";
  if (/кино|movie|film|cinema|дом кино|premier/.test(n)) return "Кино";
  if (/дет|kids|cartoon|мульт|nick|disney|карусель|boomerang/.test(n)) return "Детские";
  if (/муз|music|mtv|vh1|jazz|rock/.test(n)) return "Музыка";
  if (/наук|science|discovery|national|geo|history/.test(n)) return "Познание";
  return "Развлечения";
}

/**
 * Сопоставляет произвольное название/синоним с одним из известных каналов.
 * Возвращает id известного канала или null.
 */
export function matchKnownChannel(names, knownChannels) {
  const normNames = names.map(normalize).filter(Boolean);
  for (const ch of knownChannels) {
    const candidates = [ch.name, ...(ch.aliases || [])].map(normalize);
    for (const n of normNames) {
      if (candidates.some((c) => c === n || (n.length > 3 && (c.includes(n) || n.includes(c))))) {
        return ch.id;
      }
    }
  }
  return null;
}

/**
 * Принимает список названий каналов из внешнего источника (XMLTV-каналы
 * или каталог Яндекс.ТВ) и добавляет новые в реестр known-каналов.
 * channels: [{ names: string[], externalRef?: object }]
 */
export function discoverNewChannels(externalChannels, knownChannels, { maxNew = 100 } = {}) {
  const known = [...knownChannels];
  let added = 0;

  for (const ext of externalChannels) {
    if (added >= maxNew) break;
    const names = (ext.names || []).filter(Boolean);
    if (!names.length) continue;

    const existingId = matchKnownChannel(names, known);
    if (existingId) continue;

    const primary = names[0];
    const id = slugify(primary, known.length);
    if (known.some((c) => c.id === id)) continue;

    known.push({
      id,
      name: primary,
      aliases: names.slice(1),
      group: autoGroup(primary),
      auto: true,
      discoveredFrom: ext.source || "unknown",
      externalRef: ext.externalRef || null,
    });
    added++;
  }

  if (added > 0) log.info(`  🆕 Авто-найдено ${added} новых каналов`);
  return known;
}

// ════════════════════════════════════════════════════════════════════════
// Парсинг реальных страниц с расписанием, найденных через веб-поиск.
//
// Сайты с программой передач почти всегда верстают список как
// повторяющийся блок "время (HH:MM) + заголовок передачи" — в виде <li>,
// карточек, таблицы и т.д. Точную вёрстку конкретного сайта заранее не
// угадать (и она меняется), поэтому здесь — НЕ хардкод одного шаблона,
// а универсальная эвристика: cheerio проходит по DOM, находит текстовые
// узлы, похожие на время (HH:MM), и берёт соседний осмысленный текст как
// название передачи. Если эвристика ничего не извлекла — возвращаем
// пустой список, без фейковых программ "взамен".
// ════════════════════════════════════════════════════════════════════════

import * as cheerio from "cheerio";
import { httpGetText } from "../lib/http.js";

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isPlausibleTitle(text) {
  if (!text) return false;
  const t = text.trim();
  if (t.length < 3 || t.length > 160) return false;
  if (TIME_RE.test(t)) return false;
  if (/^[\d\s:.,%-]+$/.test(t)) return false; // строка из одних цифр/пунктуации
  return true;
}

/**
 * Превращает HH:MM (время канала на момент сейчас в МСК) в unix-timestamp
 * сегодняшнего дня; если время уже "в прошлом" более чем на 20 часов
 * относительно текущего момента — считаем, что это будущий день не имелось
 * в виду, оставляем как сегодня (большинство сайтов публикуют сетку одного
 * дня без даты).
 */
function timeStrToTodayTs(hhmm, baseDate) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(baseDate);
  d.setHours(h, m, 0, 0);
  return Math.floor(d.getTime() / 1000);
}

/**
 * Извлекает пары {time, title} из произвольной HTML-страницы расписания.
 * Стратегия:
 *  1. Находим все текстовые узлы, целиком состоящие из HH:MM.
 *  2. Для каждого такого узла смотрим на родительский блок и берём
 *     следующий по очереди "осмысленный" текстовый узел как заголовок —
 *     либо внутри того же блока, либо в соседнем элементе.
 */
export function extractScheduleFromHtml(html, { baseDate = new Date() } = {}) {
  const $ = cheerio.load(html);
  const found = [];

  $("body")
    .find("*")
    .each((_, el) => {
      const $el = $(el);
      // Берём только узлы с малым числом дочерних элементов — кандидаты
      // на "строку расписания" (время + название), а не контейнеры всей страницы.
      if ($el.children().length > 6) return;

      const ownText = $el
        .clone()
        .children()
        .remove()
        .end()
        .text()
        .trim();

      if (!TIME_RE.test(ownText)) return;

      // Кандидат на заголовок: текст самого блока без времени, либо
      // следующий соседний элемент, либо родитель целиком за вычетом времени.
      let title = "";

      const parent = $el.parent();
      const parentText = parent
        .clone()
        .find("script,style,time").remove().end()
        .text()
        .replace(ownText, "")
        .trim();

      if (isPlausibleTitle(parentText)) {
        title = parentText;
      } else {
        const next = $el.next();
        const nextText = next.text().trim();
        if (isPlausibleTitle(nextText)) title = nextText;
      }

      if (!title) {
        const siblingText = $el.siblings().first().text().trim();
        if (isPlausibleTitle(siblingText)) title = siblingText;
      }

      if (isPlausibleTitle(title)) {
        found.push({ time: ownText, title: title.replace(/\s+/g, " ").slice(0, 160) });
      }
    });

  // Дедуп по (время, заголовок), сортировка по времени
  const seen = new Set();
  const uniq = [];
  for (const f of found) {
    const key = `${f.time}|${f.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(f);
  }
  uniq.sort((a, b) => (a.time > b.time ? 1 : -1));

  // Конвертация в программы с start/stop (конец = начало следующей передачи)
  const programmes = [];
  for (let i = 0; i < uniq.length; i++) {
    const start = timeStrToTodayTs(uniq[i].time, baseDate);
    const next = uniq[i + 1] ? timeStrToTodayTs(uniq[i + 1].time, baseDate) : null;
    let stop = next && next > start ? next : start + 3600;
    programmes.push({ title: uniq[i].title, start, stop, desc: "", genre: "" });
  }
  return programmes;
}

/**
 * Скачивает страницу по URL и пытается извлечь расписание.
 * Возвращает [] при любой ошибке сети/парсинга — без подделок.
 */
export async function extractScheduleFromUrl(url) {
  const html = await httpGetText(url, { timeoutMs: 20000, retries: 1 });
  return extractScheduleFromHtml(html);
}

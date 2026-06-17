// ════════════════════════════════════════════════════════════════════════
// Источник: публичные XMLTV-фиды (epgshare01.online и зеркала).
// Это реальные, общедоступные EPG-агрегаторы без авторизации, которые
// сообщество IPTV использует много лет (используются в плеerах Kodi,
// TVHeadend, Channels DVR и т.д. — см. README со ссылками).
//
// Эти фиды используются как ДОПОЛНЕНИЕ к основному источнику (Яндекс.ТВ):
// перекрёстная проверка + покрытие каналов, которых нет на tv.yandex.ru.
// ════════════════════════════════════════════════════════════════════════

import { XMLParser } from "fast-xml-parser";
import { httpGetBuffer } from "../../lib/http.js";
import { log } from "../../lib/log.js";

// Каждый кандидат пробуется по очереди; если источник недоступен —
// робот просто идёт дальше, без фейковых данных взамен.
export const XMLTV_CANDIDATES = [
  "https://epgshare01.online/epgshare01/epg_ripper_ALL_SOURCES1.xml.gz",
  "https://raw.githubusercontent.com/Free-TV/IPTV/master/epg.xml",
  "https://iptv-org.github.io/epg/guides/ru.xml",
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
});

/**
 * Парсит дату формата XMLTV: 20260617143000 +0300
 */
function parseXmltvTime(raw) {
  if (!raw || typeof raw !== "string") return null;
  const m = raw.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, tz] = m;
  const tzSign = tz ? (tz[0] === "-" ? -1 : 1) : 1;
  const tzH = tz ? Number(tz.slice(1, 3)) : 3;
  const tzM = tz ? Number(tz.slice(3, 5)) : 0;
  const utcMs = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s) - tzSign * (tzH * 3600000 + tzM * 60000);
  return Math.floor(utcMs / 1000);
}

function toArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function textOf(node) {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "object" && "#text" in node) return String(node["#text"] ?? "");
  return "";
}

/**
 * Скачивает и парсит один XMLTV-источник.
 * Возвращает { channels: [{xmlId, names[]}], programmes: [{xmlId,title,start,stop,desc,genre}] }
 */
export async function fetchXmltvSource(url) {
  const buf = await httpGetBuffer(url, { timeoutMs: 45000, retries: 1 });
  const xml = buf.toString("utf-8");
  const doc = parser.parse(xml);
  const tv = doc?.tv;
  if (!tv) return { channels: [], programmes: [] };

  const channels = toArray(tv.channel).map((c) => ({
    xmlId: String(c["@_id"] ?? ""),
    names: toArray(c["display-name"]).map(textOf).filter(Boolean),
  }));

  const programmes = [];
  for (const p of toArray(tv.programme)) {
    const start = parseXmltvTime(p["@_start"]);
    const stop = parseXmltvTime(p["@_stop"]);
    const title = textOf(p.title);
    if (!start || !stop || !title) continue;
    programmes.push({
      xmlId: String(p["@_channel"] ?? ""),
      title: title.trim(),
      desc: textOf(p.desc).trim(),
      genre: textOf(p.category).trim(),
      start,
      stop,
    });
  }

  return { channels, programmes };
}

/**
 * Пробует кандидатов по очереди, возвращает первый успешно
 * распарсенный источник с непустыми данными.
 */
export async function fetchFirstAvailableXmltv(candidates = XMLTV_CANDIDATES) {
  for (const url of candidates) {
    try {
      log.info(`  → XMLTV: ${url}`);
      const result = await fetchXmltvSource(url);
      if (result.programmes.length > 0) {
        log.info(`  ✅ ${url}: ${result.channels.length} каналов, ${result.programmes.length} передач`);
        return { url, ...result };
      }
      log.warn(`${url}: получен пустой документ`);
    } catch (e) {
      log.warn(`${url}: ${e.message}`);
    }
  }
  return { url: null, channels: [], programmes: [] };
}

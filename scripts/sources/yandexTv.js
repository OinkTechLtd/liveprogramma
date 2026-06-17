// ════════════════════════════════════════════════════════════════════════
// Источник: tv.yandex.ru — внутренний JSON API «Яндекс.Телепрограммы»
// Без авторизации, без API-ключа. Отдаёт реальный список каналов и реальное
// расписание (название передачи, начало/конец, описание, категория).
// ════════════════════════════════════════════════════════════════════════

import { httpGetJson } from "../../lib/http.js";
import { log } from "../../lib/log.js";

const BASE = "https://tv.yandex.ru/ajax/i-tv-region/get?resource=schedule";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function buildUrl(params) {
  return `${BASE}&params=${encodeURIComponent(JSON.stringify(params))}`;
}

/**
 * Реальный список каналов, которые знает tv.yandex.ru — это и есть
 * "поисковой робот находит новые каналы": никаких выдуманных id,
 * каждый канал приходит с настоящим numeric id и синонимами названий.
 */
export async function fetchYandexChannelCatalog() {
  const url = buildUrl({
    channelLimit: 1000,
    channelProgramsLimit: 1,
    fields: "schedules,channel,title,siteUrl,logo,originalSize,src,id,synonyms",
  });

  const data = await httpGetJson(url, { headers: { "User-Agent": UA } });
  const schedules = data?.schedules;
  if (!Array.isArray(schedules)) {
    log.warn("yandexTv: пустой ответ каталога каналов");
    return [];
  }

  return schedules
    .map((s) => s.channel)
    .filter(Boolean)
    .map((ch) => ({
      yandexId: String(ch.id),
      title: ch.title,
      synonyms: Array.isArray(ch.synonyms) ? ch.synonyms : [],
      siteUrl: ch.siteUrl || null,
      logo: ch.logo?.originalSize?.src ? `https:${ch.logo.originalSize.src}` : null,
    }));
}

/**
 * Реальное расписание для пачки yandex-каналов (макс. ~5 за раз, иначе
 * сервис режет ответ). durationDays — на сколько дней вперёд тащить эфир.
 */
export async function fetchYandexSchedule(yandexIds, { durationDays = 2 } = {}) {
  if (!yandexIds.length) return [];

  const startIso = new Date().toISOString().replace(/\.\d+Z$/, "+03:00");
  const params = {
    channelLimit: yandexIds.length,
    channelProgramsLimit: 500,
    fields:
      "availableChannels,availableChannelsIds,schedules,title,description,type,id,events,channelId,start,finish,program,name",
    duration: durationDays * 86400,
    start: startIso,
    channelIds: yandexIds.map(Number),
  };

  const url = buildUrl(params);
  const data = await httpGetJson(url, { headers: { "User-Agent": UA } });
  const schedules = data?.schedules;
  if (!Array.isArray(schedules)) return [];

  const out = [];
  for (const sched of schedules) {
    const events = sched?.events;
    if (!Array.isArray(events)) continue;
    for (const ev of events) {
      if (!ev?.program?.title || !ev.start || !ev.finish) continue;
      out.push({
        yandexChannelId: String(ev.channelId),
        title: ev.program.title.trim(),
        desc: ev.program.description?.trim() || "",
        genre: ev.program.type?.name?.trim() || "",
        start: Math.floor(new Date(ev.start).getTime() / 1000),
        stop: Math.floor(new Date(ev.finish).getTime() / 1000),
      });
    }
  }
  return out;
}

/**
 * Тащит расписание для большого списка каналов батчами с лимитом
 * параллельности, чтобы не получить бан по rate-limit.
 */
export async function fetchYandexScheduleBatched(
  yandexIds,
  { batchSize = 5, concurrency = 4, durationDays = 2 } = {}
) {
  const batches = [];
  for (let i = 0; i < yandexIds.length; i += batchSize) {
    batches.push(yandexIds.slice(i, i + batchSize));
  }

  const results = new Map(); // yandexChannelId -> programmes[]
  let cursor = 0;

  async function worker() {
    while (cursor < batches.length) {
      const idx = cursor++;
      const batch = batches[idx];
      try {
        const progs = await fetchYandexSchedule(batch, { durationDays });
        for (const p of progs) {
          if (!results.has(p.yandexChannelId)) results.set(p.yandexChannelId, []);
          results.get(p.yandexChannelId).push(p);
        }
      } catch (e) {
        log.debug(`yandexTv: батч ${idx} (${batch.join(",")}) — ${e.message}`);
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

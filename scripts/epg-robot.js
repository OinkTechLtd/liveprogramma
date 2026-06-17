#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// live-programm | EPG-робот v3 (Node.js)
// OinkTech Ltd | FUN RUSSIA CRMP
//
// Принцип работы (никаких мок-данных и заглушек):
//   1. Загружаем реестр известных каналов (растёт от запуска к запуску).
//   2. Тащим публичные XMLTV-агрегаторы — реальные расписания сразу для
//      многих каналов одним запросом.
//   3. Для каналов, которым XMLTV не дал расписания, реально ищем в
//      интернете (DuckDuckGo/Bing) страницу с программой передач и
//      парсим её (cheerio-эвристика по парам "время + название").
//   4. Если и поиск не нашёл ничего — последний резерв: JSON API
//      tv.yandex.ru (тоже настоящие данные, не выдумка).
//   5. Если для канала так и не нашлось расписание — он публикуется
//      БЕЗ программы передач (channel.no_data = true), а не с фейком.
//   6. Заодно ищем новые каналы (из XMLTV-источника и каталога Яндекс.ТВ)
//      и добавляем их в реестр — список каналов растёт сам.
//   7. Привязываем реальные m3u8 stream_url из публичных плейлистов.
// ════════════════════════════════════════════════════════════════════════

import { writeFileSync, mkdirSync } from "node:fs";
import { CONFIG } from "./config.js";
import { log } from "../lib/log.js";
import { sleep } from "../lib/http.js";

import { loadChannelRegistry, saveChannelRegistry } from "./channelRegistry.js";
import { discoverNewChannels, matchKnownChannel } from "./discovery.js";
import { fetchFirstAvailableXmltv } from "./sources/xmltv.js";
import { webSearch } from "./sources/webSearch.js";
import { extractScheduleFromUrl } from "./htmlScheduleParser.js";
import { fetchYandexChannelCatalog, fetchYandexScheduleBatched } from "./sources/yandexTv.js";
import { loadPlaylists } from "./sources/playlists.js";

mkdirSync("data", { recursive: true });

function nowTs() {
  return Math.floor(Date.now() / 1000);
}

function dedupAndSort(programmes) {
  const seen = new Set();
  const uniq = [];
  for (const p of programmes) {
    const key = `${p.start}|${p.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(p);
  }
  uniq.sort((a, b) => a.start - b.start);
  return uniq;
}

function withinWindow(p, now) {
  return p.stop >= now - CONFIG.windowPastSec && p.start <= now + CONFIG.windowFutureSec;
}

async function main() {
  log.info("🤖 Запуск EPG-робота v3 (Node.js)...");
  const startedAt = Date.now();

  let channels = loadChannelRegistry();
  const schedule = new Map(); // channel.id -> programmes[]

  // ── Шаг 1: публичные XMLTV-агрегаторы ─────────────────────────────────
  log.info("📡 Шаг 1: реальные XMLTV-агрегаторы...");
  const xmltvResult = await fetchFirstAvailableXmltv();

  if (xmltvResult.channels.length > 0) {
    // Сопоставляем XMLTV-каналы с нашим реестром по названию
    const idMap = new Map(); // xmlId -> our channel id
    for (const xc of xmltvResult.channels) {
      const ourId = matchKnownChannel([xc.xmlId, ...xc.names], channels);
      if (ourId) idMap.set(xc.xmlId, ourId);
    }

    let matchedCount = 0;
    for (const prog of xmltvResult.programmes) {
      const ourId = idMap.get(prog.xmlId);
      if (!ourId) continue;
      if (!schedule.has(ourId)) schedule.set(ourId, []);
      schedule.get(ourId).push({
        title: prog.title,
        start: prog.start,
        stop: prog.stop,
        desc: prog.desc,
        genre: prog.genre,
        source: "xmltv",
      });
      matchedCount++;
    }
    log.info(`  ✅ XMLTV дал расписание для ${idMap.size} известных каналов (${matchedCount} передач)`);

    // ── Шаг 1b: новые каналы из XMLTV-источника ────────────────────────
    log.info("🆕 Шаг 1b: поиск новых каналов в XMLTV-источнике...");
    const xmltvCandidates = xmltvResult.channels
      .filter((xc) => !idMap.has(xc.xmlId))
      .map((xc) => ({ names: xc.names, source: "xmltv", externalRef: { xmlId: xc.xmlId } }));
    channels = discoverNewChannels(xmltvCandidates, channels, { maxNew: CONFIG.maxNewChannelsPerRun });
  } else {
    log.warn("Ни один публичный XMLTV-источник не ответил в этот раз");
  }

  // ── Шаг 2: настоящий веб-поиск для каналов без расписания ────────────
  const missingAfterXmltv = channels.filter((ch) => !schedule.has(ch.id) || schedule.get(ch.id).length === 0);
  const toSearch = missingAfterXmltv.slice(0, CONFIG.webSearchBatchPerRun);
  log.info(`🔍 Шаг 2: веб-поиск расписания для ${toSearch.length} каналов без данных...`);

  for (const ch of toSearch) {
    try {
      const query = `${ch.name} программа передач сегодня`;
      const results = await webSearch(query, { maxResults: 5 });
      if (results.length === 0) {
        log.debug(`  ${ch.name}: поиск не дал результатов`);
        continue;
      }

      let got = [];
      for (const r of results) {
        try {
          const progs = await extractScheduleFromUrl(r.url);
          if (progs.length >= 3) {
            got = progs;
            log.info(`  ✅ ${ch.name}: ${progs.length} передач со страницы ${new URL(r.url).hostname}`);
            break;
          }
        } catch (e) {
          log.debug(`  ${ch.name} / ${r.url}: ${e.message}`);
        }
      }

      if (got.length > 0) {
        schedule.set(
          ch.id,
          got.map((p) => ({ ...p, source: "websearch" }))
        );
      } else {
        log.debug(`  ${ch.name}: ни одна из найденных страниц не дала расписания`);
      }
    } catch (e) {
      log.debug(`webSearch ${ch.name}: ${e.message}`);
    }
    await sleep(CONFIG.webSearchDelayMs);
  }

  // ── Шаг 3: Яндекс.ТВ JSON API — резерв, если поиск не нашёл ───────────
  const stillMissing = channels.filter((ch) => !schedule.has(ch.id) || schedule.get(ch.id).length === 0);
  log.info(`📺 Шаг 3 (резерв): Яндекс.ТВ API для ${stillMissing.length} каналов без расписания...`);

  let yandexCatalog = [];
  try {
    yandexCatalog = await fetchYandexChannelCatalog();
    log.info(`  📂 Каталог Яндекс.ТВ: ${yandexCatalog.length} каналов`);
  } catch (e) {
    log.warn(`Яндекс.ТВ каталог недоступен: ${e.message}`);
  }

  if (yandexCatalog.length > 0 && stillMissing.length > 0) {
    const yandexIdByOurId = new Map();
    for (const ch of stillMissing) {
      const yc = yandexCatalog.find(
        (y) => matchKnownChannel([y.title, ...y.synonyms], [ch]) === ch.id
      );
      if (yc) yandexIdByOurId.set(ch.id, yc.yandexId);
    }

    if (yandexIdByOurId.size > 0) {
      log.info(`  🔗 Сопоставлено ${yandexIdByOurId.size} каналов с Яндекс.ТВ, тащим расписание...`);
      const yandexIds = [...yandexIdByOurId.values()];
      const yandexSchedules = await fetchYandexScheduleBatched(yandexIds, {
        durationDays: CONFIG.scheduleDurationDays,
      });

      for (const [ourId, yandexId] of yandexIdByOurId) {
        const progs = yandexSchedules.get(yandexId);
        if (progs && progs.length > 0) {
          schedule.set(
            ourId,
            progs.map((p) => ({
              title: p.title,
              start: p.start,
              stop: p.stop,
              desc: p.desc,
              genre: p.genre,
              source: "yandex-tv-fallback",
            }))
          );
          log.info(`  ✅ ${ourId}: ${progs.length} передач (резерв Яндекс.ТВ)`);
        }
      }
    }

    // ── Шаг 3b: новые каналы из каталога Яндекс.ТВ ─────────────────────
    log.info("🆕 Шаг 3b: поиск новых каналов в каталоге Яндекс.ТВ...");
    const yandexCandidates = yandexCatalog
      .filter((y) => matchKnownChannel([y.title, ...y.synonyms], channels) === null)
      .map((y) => ({ names: [y.title, ...y.synonyms], source: "yandex-tv", externalRef: { yandexId: y.yandexId } }));
    channels = discoverNewChannels(yandexCandidates, channels, {
      maxNew: Math.max(0, CONFIG.maxNewChannelsPerRun - 1),
    });
  }

  // ── Шаг 4: реальные m3u8-потоки из публичных плейлистов ───────────────
  log.info("🎬 Шаг 4: загрузка m3u8-плейлистов...");
  const streamMap = await loadPlaylists(CONFIG.playlistUrls);
  let streamsMatched = 0;
  for (const ch of channels) {
    if (ch.stream_url) continue;
    const candidates = [ch.name, ...(ch.aliases || [])].map((s) => s.toLowerCase());
    for (const c of candidates) {
      if (streamMap.has(c)) {
        ch.stream_url = streamMap.get(c);
        streamsMatched++;
        break;
      }
    }
  }
  log.info(`  📡 Привязано ${streamsMatched} реальных потоков`);

  // ── Финализация: окно публикации, live-флаги, очистка пустых ─────────
  const now = nowTs();
  const channelsOut = {};
  const scheduleOut = {};
  let totalProgs = 0;

  for (const ch of channels) {
    channelsOut[ch.id] = {
      id: ch.id,
      name: ch.name,
      aliases: ch.aliases || [],
      group: ch.group || "Развлечения",
      ...(ch.stream_url ? { stream_url: ch.stream_url } : {}),
      ...(ch.auto ? { auto: true } : {}),
    };

    const progs = schedule.get(ch.id);
    if (!progs || progs.length === 0) {
      channelsOut[ch.id].no_data = true;
      continue;
    }

    const windowed = dedupAndSort(progs).filter((p) => withinWindow(p, now));
    if (windowed.length === 0) {
      channelsOut[ch.id].no_data = true;
      continue;
    }

    scheduleOut[ch.id] = windowed.map((p) => ({
      channel: ch.id,
      title: p.title,
      start: p.start,
      stop: p.stop,
      desc: p.desc || "",
      genre: p.genre || "",
      live: p.start <= now && now < p.stop,
    }));
    totalProgs += scheduleOut[ch.id].length;
  }

  const out = {
    updated: new Date().toISOString(),
    updated_ts: now,
    generator: "live-programm EPG robot v3 (Node.js)",
    channels: channelsOut,
    schedule: scheduleOut,
  };

  writeFileSync("data/schedule.json", JSON.stringify(out), "utf-8");
  saveChannelRegistry(channels);

  const withData = Object.values(scheduleOut).length;
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  log.info(
    `✅ Итого: ${channels.length} каналов в реестре, ${withData} с реальным расписанием (${totalProgs} передач), ${elapsed}с`
  );
}

main().catch((e) => {
  log.error(`Робот завершился с ошибкой: ${e.stack || e.message}`);
  process.exit(1);
});

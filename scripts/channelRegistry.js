// ════════════════════════════════════════════════════════════════════════
// Персистентный реестр каналов. При первом запуске = SEED_CHANNELS.
// На каждом следующем запуске робот дополняет его реально найденными
// каналами (см. discovery.js) и сохраняет обратно — так список каналов
// растёт от запуска к запуску, как просил пользователь.
// ════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { SEED_CHANNELS } from "./seedChannels.js";
import { log } from "../lib/log.js";

const REGISTRY_PATH = process.env.EPG_CHANNELS_PATH || "data/known-channels.json";

export function loadChannelRegistry() {
  try {
    const raw = readFileSync(REGISTRY_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      log.info(`📂 Загружен реестр каналов: ${parsed.length} каналов`);
      return mergeMissingSeeds(parsed);
    }
  } catch {
    /* реестра ещё нет — нормально для первого запуска */
  }
  log.info(`📂 Реестр каналов не найден, старт со стартового списка (${SEED_CHANNELS.length} каналов)`);
  return [...SEED_CHANNELS];
}

function mergeMissingSeeds(existing) {
  const ids = new Set(existing.map((c) => c.id));
  const merged = [...existing];
  for (const seed of SEED_CHANNELS) {
    if (!ids.has(seed.id)) merged.push(seed);
  }
  return merged;
}

export function saveChannelRegistry(channels) {
  mkdirSync(dirname(REGISTRY_PATH), { recursive: true });
  writeFileSync(REGISTRY_PATH, JSON.stringify(channels, null, 0), "utf-8");
  log.info(`💾 Реестр каналов сохранён: ${channels.length} каналов`);
}

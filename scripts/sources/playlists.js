// ════════════════════════════════════════════════════════════════════════
// Загрузка и парсинг публичных M3U-плейлистов: привязываем реальные
// stream_url к каналам по названию. Источники задаются в конфиге проекта
// (см. scripts/config.js) — это собственные плейлисты пользователя
// (OinkTech) плюс при желании можно добавить публичные зеркала.
// ════════════════════════════════════════════════════════════════════════

import { httpGetText } from "../../lib/http.js";
import { log } from "../../lib/log.js";

export function parseM3u(text) {
  const map = new Map(); // normalized name -> url
  const lines = text.split("\n");
  let pendingName = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("#EXTINF")) {
      const nameMatch = line.match(/,(.+)$/);
      pendingName = nameMatch ? nameMatch[1].trim() : null;
    } else if (line && !line.startsWith("#") && pendingName) {
      map.set(pendingName.toLowerCase(), line);
      pendingName = null;
    }
  }
  return map;
}

export async function loadPlaylists(urls) {
  const merged = new Map();
  for (const url of urls) {
    try {
      const text = await httpGetText(url, { timeoutMs: 20000, retries: 1 });
      const parsed = parseM3u(text);
      for (const [name, streamUrl] of parsed) {
        if (!merged.has(name)) merged.set(name, streamUrl);
      }
      log.info(`  📺 Плейлист ${url}: ${parsed.size} записей`);
    } catch (e) {
      log.debug(`playlist ${url}: ${e.message}`);
    }
  }
  return merged;
}

// ════════════════════════════════════════════════════════════════════════
// Реальный поиск по интернету без API-ключей.
// Цепочка backend'ов (как в библиотеке duckduckgo-search: backend=auto):
//   1. html.duckduckgo.com/html/  — статическая выдача DDG
//   2. lite.duckduckgo.com/lite/  — облегчённая выдача DDG (табличная)
//   3. www.bing.com/search        — резерв, если оба DDG-backend'а недоступны
//
// Если поисковик вернул пустую/заблокированную выдачу — функция возвращает
// пустой массив. Никаких выдуманных результатов.
// ════════════════════════════════════════════════════════════════════════

import { httpGetText } from "../../lib/http.js";
import { log } from "../../lib/log.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function decodeHtmlEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(s) {
  return decodeHtmlEntities(s.replace(/<[^>]+>/g, "")).trim();
}

/** Разворачивает DDG-редиректную ссылку //duckduckgo.com/l/?uddg=... в прямой URL */
function unwrapDdgLink(href) {
  try {
    const full = href.startsWith("//") ? `https:${href}` : href;
    const u = new URL(full);
    const target = u.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : full;
  } catch {
    return href;
  }
}

async function searchDuckDuckGoHtml(query) {
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const html = await httpGetText(url, {
    headers: { "User-Agent": UA, Referer: "https://html.duckduckgo.com/" },
    timeoutMs: 15000,
    retries: 1,
  });

  const results = [];
  const blockRe = /<div[^>]+class="[^"]*\bresult\b[^"]*"[\s\S]*?(?=<div[^>]+class="[^"]*\bresult\b[^"]*"|$)/g;
  const linkRe = /<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/;
  const snippetRe = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/;

  let block;
  while ((block = blockRe.exec(html)) !== null) {
    const chunk = block[0];
    const linkMatch = linkRe.exec(chunk);
    if (!linkMatch) continue;
    const href = unwrapDdgLink(linkMatch[1]);
    const title = stripTags(linkMatch[2]);
    const snippetMatch = snippetRe.exec(chunk);
    const snippet = snippetMatch ? stripTags(snippetMatch[1]) : "";
    if (href.startsWith("http")) results.push({ title, url: href, snippet });
  }
  return results;
}

async function searchDuckDuckGoLite(query) {
  const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
  const html = await httpGetText(url, {
    headers: { "User-Agent": UA, Referer: "https://lite.duckduckgo.com/" },
    timeoutMs: 15000,
    retries: 1,
  });

  const results = [];
  // В lite-версии ссылки результатов — обычные <a rel="nofollow" href="...">
  const linkRe = /<a[^>]+rel="nofollow"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const href = unwrapDdgLink(m[1]);
    const title = stripTags(m[2]);
    if (href.startsWith("http") && title) results.push({ title, url: href, snippet: "" });
  }
  return results;
}

async function searchBing(query) {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=ru&cc=RU`;
  const html = await httpGetText(url, {
    headers: { "User-Agent": UA, "Accept-Language": "ru-RU,ru;q=0.9" },
    timeoutMs: 15000,
    retries: 1,
  });

  const results = [];
  const liRe = /<li class="b_algo"[\s\S]*?<h2><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>/g;
  let m;
  while ((m = liRe.exec(html)) !== null) {
    const href = m[1];
    const title = stripTags(m[2]);
    if (href.startsWith("http")) results.push({ title, url: href, snippet: "" });
  }
  return results;
}

const BACKENDS = [
  { name: "duckduckgo-html", fn: searchDuckDuckGoHtml },
  { name: "duckduckgo-lite", fn: searchDuckDuckGoLite },
  { name: "bing", fn: searchBing },
];

/**
 * Реальный поиск по интернету. Пробует backend'ы по очереди до первого
 * непустого результата. Возвращает [] если все недоступны — без подделок.
 */
export async function webSearch(query, { maxResults = 8 } = {}) {
  for (const backend of BACKENDS) {
    try {
      const results = await backend.fn(query);
      if (results.length > 0) {
        log.debug(`webSearch[${backend.name}] "${query}" → ${results.length} результатов`);
        return results.slice(0, maxResults);
      }
    } catch (e) {
      log.debug(`webSearch[${backend.name}] "${query}" — ${e.message}`);
    }
  }
  log.warn(`webSearch: ни один backend не дал результатов для "${query}"`);
  return [];
}

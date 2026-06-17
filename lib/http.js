// ════════════════════════════════════════════════════════════════════════
// Общий HTTP-клиент: таймауты, ретраи, gzip, единый User-Agent.
// Построен на нативном fetch (Node 18+), без лишних зависимостей.
// ════════════════════════════════════════════════════════════════════════

import { gunzipSync } from "node:zlib";
import { log } from "./log.js";

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function withTimeout(ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, cancel: () => clearTimeout(timer) };
}

/**
 * Базовый fetch с таймаутом и ретраями на сетевые ошибки/5xx.
 */
export async function httpGet(url, { headers = {}, timeoutMs = 20000, retries = 2 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const { signal, cancel } = withTimeout(timeoutMs);
    try {
      const res = await fetch(url, {
        signal,
        headers: { "User-Agent": DEFAULT_UA, "Accept-Language": "ru-RU,ru;q=0.9", ...headers },
      });
      cancel();
      if (res.status >= 500 && attempt < retries) {
        lastErr = new Error(`HTTP ${res.status}`);
        await sleep(400 * (attempt + 1));
        continue;
      }
      return res;
    } catch (e) {
      cancel();
      lastErr = e;
      if (attempt < retries) {
        await sleep(400 * (attempt + 1));
        continue;
      }
    }
  }
  throw lastErr;
}

export async function httpGetText(url, opts = {}) {
  const res = await httpGet(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} для ${url}`);
  return res.text();
}

export async function httpGetJson(url, opts = {}) {
  const res = await httpGet(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} для ${url}`);
  return res.json();
}

/**
 * Загружает бинарный ресурс и при необходимости разворачивает gzip
 * (как по заголовку Content-Encoding, так и по магическим байтам —
 * некоторые EPG-зеркала отдают .gz без правильного заголовка).
 */
export async function httpGetBuffer(url, opts = {}) {
  const res = await httpGet(url, opts);
  if (!res.ok) throw new Error(`HTTP ${res.status} для ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const isGzipMagic = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  if (isGzipMagic) {
    try {
      return gunzipSync(buf);
    } catch (e) {
      log.debug(`gunzip не удался для ${url}: ${e.message}`);
    }
  }
  return buf;
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

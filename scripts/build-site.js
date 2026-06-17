#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// Сборщик статического сайта (docs/) для GitHub Pages.
// Копирует index.html/embed.html/player.html с встроенными данными
// расписания, плюс кладёт data/*.json в docs/data/.
// ════════════════════════════════════════════════════════════════════════

import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { log } from "../lib/log.js";

const ROOT = process.cwd();
const DOCS = join(ROOT, "docs");
const DATA = join(ROOT, "data");

mkdirSync(DOCS, { recursive: true });
mkdirSync(join(DOCS, "data"), { recursive: true });

let epgData = null;
const schedulePath = join(DATA, "schedule.json");
if (existsSync(schedulePath)) {
  epgData = JSON.parse(readFileSync(schedulePath, "utf-8"));
  const channelsCount = Object.keys(epgData.channels || {}).length;
  const progsCount = Object.values(epgData.schedule || {}).reduce((a, v) => a + v.length, 0);
  log.info(`📊 schedule.json: ${channelsCount} каналов, ${progsCount} передач`);
} else {
  log.warn("data/schedule.json не найден — сайт будет собран без встроенных данных");
}

function injectData(htmlPath, outPath) {
  if (!existsSync(htmlPath)) {
    log.warn(`${htmlPath} не найден`);
    return;
  }
  let html = readFileSync(htmlPath, "utf-8");
  if (epgData) {
    const snippet = `<script>window.__EPG_DATA__=${JSON.stringify(epgData)};</script>`;
    html = html.replace("</head>", `${snippet}\n</head>`);
  }
  writeFileSync(outPath, html, "utf-8");
  log.info(`  ✅ ${basename(outPath)}`);
}

function copyIfExists(src, dst) {
  if (existsSync(src)) {
    copyFileSync(src, dst);
    log.info(`  ✅ ${basename(src)}`);
  } else {
    log.warn(`${src} не найден`);
  }
}

log.info("🏗️  Собираем docs/...");
injectData(join(ROOT, "index.html"), join(DOCS, "index.html"));
injectData(join(ROOT, "embed.html"), join(DOCS, "embed.html"));
copyIfExists(join(ROOT, "player.html"), join(DOCS, "player.html"));

if (existsSync(DATA)) {
  for (const f of readdirSync(DATA)) {
    if (f.endsWith(".json")) {
      copyFileSync(join(DATA, f), join(DOCS, "data", f));
    }
  }
}

log.info("✅ docs/ собран");

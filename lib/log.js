// ════════════════════════════════════════════════════════════════════════
// Лёгкий логгер: пишет в stdout и дублирует в data/robot.log
// ════════════════════════════════════════════════════════════════════════

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const LOG_PATH = process.env.EPG_LOG_PATH || "data/robot.log";

try {
  mkdirSync(dirname(LOG_PATH), { recursive: true });
} catch {
  /* директория уже существует — это нормально */
}

function timestamp() {
  return new Date().toTimeString().slice(0, 8);
}

function write(line) {
  const full = `[${timestamp()}] ${line}`;
  console.log(full);
  try {
    appendFileSync(LOG_PATH, full + "\n", "utf-8");
  } catch {
    /* не критично, если лог-файл недоступен на запись */
  }
}

export const log = {
  info: (msg) => write(msg),
  warn: (msg) => write(`⚠️  ${msg}`),
  error: (msg) => write(`❌ ${msg}`),
  debug: (msg) => {
    if (process.env.EPG_DEBUG) write(`🔧 ${msg}`);
  },
};

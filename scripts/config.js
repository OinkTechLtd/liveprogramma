// ════════════════════════════════════════════════════════════════════════
// Конфигурация EPG-робота
// ════════════════════════════════════════════════════════════════════════

export const CONFIG = {
  // Реальные публичные M3U-плейлисты (собственные репозитории пользователя).
  // Каждый URL пробуется независимо; недоступные просто пропускаются.
  playlistUrls: [
    "https://raw.githubusercontent.com/OinkTechLLC/livem3u/main/zabava-full.m3u",
    "https://raw.githubusercontent.com/OinkTechLtd/rulive/main/russ.m3u",
    "https://raw.githubusercontent.com/OinkTechLLC/livem3u/main/smotrim.m3u",
  ],

  // Сколько дней вперёд тащим расписание
  scheduleDurationDays: 2,

  // Поиск: сколько каналов за один прогон обрабатывать через веб-поиск
  // (чтобы не упереться в rate-limit поисковиков на каждом запуске)
  webSearchBatchPerRun: 40,

  // Сколько новых каналов максимум добавлять за один прогон
  maxNewChannelsPerRun: 60,

  // Задержка между запросами веб-поиска (мс), чтобы быть мягче к серверам
  webSearchDelayMs: 600,

  // Window для публикации передач во фронт (от now-1ч до now+48ч)
  windowPastSec: 3600,
  windowFutureSec: 2 * 86400,
};

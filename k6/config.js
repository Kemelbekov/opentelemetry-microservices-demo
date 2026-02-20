/**
 * config.js — центральная конфигурация нагрузочных тестов
 *
 * Источники подтверждения параметров:
 *   - src/frontend/main.go       — регистрация роутов
 *   - src/frontend/handlers.go   — обработчики HTTP
 *   - kubernetes-manifests/frontend.yaml — порт 8080, Service type LoadBalancer
 *   - src/productcatalogservice/products.json — список товаров (seed)
 */

// ── Базовый URL ────────────────────────────────────────────────────────────────
export const BASE_URL = (__ENV.BASE_URL || 'http://localhost:8080').replace(/\/$/, '');

// ── Таймауты ───────────────────────────────────────────────────────────────────
export const TIMEOUT_CONNECT  = __ENV.TIMEOUT_CONNECT  || '5s';
export const TIMEOUT_READ     = __ENV.TIMEOUT_READ     || '10s';
export const TIMEOUT_WRITE    = __ENV.TIMEOUT_WRITE    || '5s';

// ── Think time ────────────────────────────────────────────────────────────────
// Отключить паузы: THINK_TIME=0
export const THINK_TIME_ENABLED = (__ENV.THINK_TIME !== '0');
export const THINK_TIME_MIN     = parseFloat(__ENV.THINK_TIME_MIN || '0.5');
export const THINK_TIME_MAX     = parseFloat(__ENV.THINK_TIME_MAX || '2.0');

// ── Нагрузочные параметры (дефолты для load.js) ──────────────────────────────
export const VUS               = parseInt(__ENV.VUS        || '20');
export const RATE              = parseInt(__ENV.RATE       || '10');   // iterations/sec (arrival rate)
export const DURATION          = __ENV.DURATION            || '5m';
export const PRE_ALLOC_VUS     = parseInt(__ENV.PRE_ALLOC  || '20');
export const MAX_VUS           = parseInt(__ENV.MAX_VUS    || '100');

// ── Smoke ─────────────────────────────────────────────────────────────────────
export const SMOKE_VUS         = parseInt(__ENV.SMOKE_VUS  || '2');
export const SMOKE_DURATION    = __ENV.SMOKE_DURATION      || '2m';

// ── Stress ────────────────────────────────────────────────────────────────────
export const STRESS_MAX_RATE   = parseInt(__ENV.STRESS_MAX_RATE || '100');

// ── Soak ──────────────────────────────────────────────────────────────────────
export const SOAK_RATE         = parseInt(__ENV.SOAK_RATE  || '5');
export const SOAK_DURATION     = __ENV.SOAK_DURATION       || '30m';

// ── Thresholds ────────────────────────────────────────────────────────────────
// Экспортируем как объект, чтобы переиспользовать в каждом скрипте
export const COMMON_THRESHOLDS = {
  // Глобальный % ошибок
  'http_req_failed': [
    { threshold: 'rate<0.01', abortOnFail: false },  // < 1 % ошибок
  ],

  // Латентность всех запросов
  'http_req_duration': [
    { threshold: 'p(95)<2000', abortOnFail: false },
    { threshold: 'p(99)<5000', abortOnFail: false },
  ],

  // Ключевые транзакции (тегированные)
  'http_req_duration{step:home}':           [{ threshold: 'p(95)<1500' }],
  'http_req_duration{step:product}':        [{ threshold: 'p(95)<1500' }],
  'http_req_duration{step:add_to_cart}':    [{ threshold: 'p(95)<2000' }],
  'http_req_duration{step:view_cart}':      [{ threshold: 'p(95)<1500' }],
  'http_req_duration{step:checkout}':       [{ threshold: 'p(95)<4000' }],

  // Пользовательские метрики
  'checkout_success_rate': [{ threshold: 'rate>0.95' }],
  'checkout_duration':     [{ threshold: 'p(95)<6000' }],
};

// ── Параметры HTTP-запросов ────────────────────────────────────────────────────
export function httpParams(extraTags = {}) {
  return {
    timeout: TIMEOUT_READ,
    tags: extraTags,
    headers: {
      'User-Agent': 'k6-loadtest/1.0',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5',
    },
  };
}

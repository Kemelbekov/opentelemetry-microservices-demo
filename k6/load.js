/**
 * load.js — Целевой нагрузочный тест (Production-like load)
 *
 * Цель: симулировать ожидаемую пиковую нагрузку с реалистичным распределением journey.
 * Executor: constant-arrival-rate — гарантирует фиксированный RPS независимо от latency.
 *
 * Почему constant-arrival-rate:
 *   - Production трафик = фиксированное кол-во пользователей в единицу времени,
 *     не зависящее от времени ответа сервера.
 *   - VU-based executors "замедляются" вместе с деградацией сервиса — это маскирует проблемы.
 *
 * Запуск:
 *   k6 run -e BASE_URL=http://localhost:8080 scripts/load.js
 *   k6 run -e BASE_URL=http://... -e RATE=20 -e DURATION=10m -e MAX_VUS=200 scripts/load.js
 */

import { CookieJar } from 'k6/http';
import { Trend } from 'k6/metrics';

import { RATE, DURATION, PRE_ALLOC_VUS, MAX_VUS, COMMON_THRESHOLDS } from '../lib/config.js';
import { journeyWeighted } from '../lib/journeys.js';
import { getHome, parseProductIds } from '../lib/api.js';
import { PRODUCTS } from '../lib/data.js';

export const checkoutDuration = new Trend('checkout_duration', true);

export const options = {
  scenarios: {
    load: {
      executor:        'constant-arrival-rate',
      rate:            RATE,           // iterations/sec (env: RATE, default: 10)
      timeUnit:        '1s',
      duration:        DURATION,       // env: DURATION, default: 5m
      preAllocatedVUs: PRE_ALLOC_VUS,  // env: PRE_ALLOC, default: 20
      maxVUs:          MAX_VUS,        // env: MAX_VUS,   default: 100
    },
  },

  thresholds: {
    ...COMMON_THRESHOLDS,
    'http_req_failed': [{ threshold: 'rate<0.01', abortOnFail: true }],
    'checkout_success_rate': ['rate>0.95'],
    'checkout_duration': ['p(95)<6000'],
  },
};

// ── Setup: получить product-ids заранее ──────────────────────────────────────
export function setup() {
  const jar = new CookieJar();
  const res = getHome(jar);
  const ids = parseProductIds(res.body || '');
  console.log(`[load] Product IDs found: ${ids.length}`);
  return { productIds: ids.length > 0 ? ids : PRODUCTS.map(p => p.id) };
}

// ── Default function: взвешенный journey ─────────────────────────────────────
export default function (data) {
  journeyWeighted(data.productIds);
}

export function handleSummary(data) {
  const m = data.metrics;
  const rps = m.http_reqs?.values?.rate?.toFixed(2) || '?';
  const p95 = m.http_req_duration?.values?.['p(95)']?.toFixed(0) || '?';
  const p99 = m.http_req_duration?.values?.['p(99)']?.toFixed(0) || '?';
  const errRate = ((m.http_req_failed?.values?.rate || 0) * 100).toFixed(2);
  const chkp95 = m.checkout_duration?.values?.['p(95)']?.toFixed(0) || '?';
  const chkOk = ((m.checkout_success_rate?.values?.rate || 0) * 100).toFixed(1);

  console.log('\n============ LOAD TEST SUMMARY ============');
  console.log(`RPS (actual):      ${rps} req/s`);
  console.log(`Error rate:        ${errRate}%`);
  console.log(`p95 duration:      ${p95}ms`);
  console.log(`p99 duration:      ${p99}ms`);
  console.log(`Checkout p95:      ${chkp95}ms`);
  console.log(`Checkout success:  ${chkOk}%`);
  console.log(`VUs (peak):        ${m.vus_max?.values?.max || '?'}`);
  console.log('===========================================\n');

  return {
    'results/load-summary.json': JSON.stringify(data, null, 2),
  };
}

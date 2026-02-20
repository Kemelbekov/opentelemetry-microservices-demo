/**
 * soak.js — Soak-тест (долгосрочная стабильность)
 *
 * Цель: обнаружить утечки памяти, деградацию производительности,
 *       накопление ошибок при длительной умеренной нагрузке.
 *
 * Executor: constant-arrival-rate (предсказуемый RPS на всём протяжении).
 * Duration: SOAK_DURATION (default 30m, рекомендуется 2h для prod).
 *
 * Запуск:
 *   k6 run -e BASE_URL=http://localhost:8080 scripts/soak.js
 *   k6 run -e BASE_URL=http://... -e SOAK_RATE=5 -e SOAK_DURATION=120m scripts/soak.js
 */

import { CookieJar } from 'k6/http';
import { Trend, Rate, Counter } from 'k6/metrics';

import { SOAK_RATE, SOAK_DURATION, MAX_VUS, COMMON_THRESHOLDS } from '../lib/config.js';
import { journeyWeighted } from '../lib/journeys.js';
import { getHome, parseProductIds } from '../lib/api.js';
import { PRODUCTS } from '../lib/data.js';

// Дополнительные метрики для отслеживания деградации во времени
export const checkoutDuration  = new Trend('checkout_duration', true);
export const soakErrors        = new Counter('soak_errors');
export const degradationRate   = new Rate('degradation_rate');  // запросы > 2s

export const options = {
  scenarios: {
    soak: {
      executor:        'constant-arrival-rate',
      rate:            SOAK_RATE,     // default 5 rps — умеренно для долгого теста
      timeUnit:        '1s',
      duration:        SOAK_DURATION, // default 30m
      preAllocatedVUs: 20,
      maxVUs:          MAX_VUS,
    },
  },

  thresholds: {
    ...COMMON_THRESHOLDS,
    'http_req_failed':        [{ threshold: 'rate<0.01', abortOnFail: false }],
    'checkout_success_rate':  [{ threshold: 'rate>0.95', abortOnFail: false }],
    'checkout_duration':      [{ threshold: 'p(95)<6000', abortOnFail: false }],
    // Если деградация > 5% — флаг для расследования
    'degradation_rate':       [{ threshold: 'rate<0.05', abortOnFail: false }],
    // Ключевой soak-индикатор: p99 не должно расти безгранично
    'http_req_duration':      [
      { threshold: 'p(95)<3000', abortOnFail: false },
      { threshold: 'p(99)<8000', abortOnFail: false },
    ],
  },
};

export function setup() {
  const jar = new CookieJar();
  const res = getHome(jar);
  const ids = parseProductIds(res.body || '');
  console.log(`[soak] Starting ${SOAK_DURATION} soak at ${SOAK_RATE} rps`);
  console.log(`[soak] Product IDs: ${(ids.length > 0 ? ids : PRODUCTS.map(p => p.id)).join(', ')}`);
  return { productIds: ids.length > 0 ? ids : PRODUCTS.map(p => p.id) };
}

export default function (data) {
  journeyWeighted(data.productIds);
}

export function teardown(data) {
  console.log('[soak] Teardown complete');
}

export function handleSummary(data) {
  const m = data.metrics;
  const errRate  = ((m.http_req_failed?.values?.rate || 0) * 100).toFixed(3);
  const p95      = m.http_req_duration?.values?.['p(95)']?.toFixed(0) || '?';
  const p99      = m.http_req_duration?.values?.['p(99)']?.toFixed(0) || '?';
  const chkOk    = ((m.checkout_success_rate?.values?.rate || 0) * 100).toFixed(1);
  const degrade  = ((m.degradation_rate?.values?.rate || 0) * 100).toFixed(2);
  const totalReq = m.http_reqs?.values?.count || 0;
  const duration = SOAK_DURATION;

  console.log('\n============= SOAK TEST SUMMARY =============');
  console.log(`Duration:          ${duration}`);
  console.log(`Total requests:    ${totalReq}`);
  console.log(`Error rate:        ${errRate}%`);
  console.log(`p95 duration:      ${p95}ms`);
  console.log(`p99 duration:      ${p99}ms`);
  console.log(`Checkout success:  ${chkOk}%`);
  console.log(`Slow req rate:     ${degrade}%  (>2s)  ← следите за трендом`);
  console.log('');
  console.log('Что искать в результатах:');
  console.log('  - Постепенный рост p95/p99 во времени → утечка памяти');
  console.log('  - Периодические спайки ошибок → GC паузы / reconnect');
  console.log('  - Накопление soak_errors → деградация зависимостей');
  console.log('==============================================\n');

  return {
    'results/soak-summary.json': JSON.stringify(data, null, 2),
  };
}

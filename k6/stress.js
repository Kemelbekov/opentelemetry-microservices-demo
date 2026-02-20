/**
 * stress.js — Стресс-тест (поиск предела)
 *
 * Цель: ступенчато увеличивать нагрузку до момента деградации/отказа,
 *       чтобы найти «точку перегиба» системы.
 *
 * Executor: ramping-arrival-rate
 *   - Ступени: 0 → max за несколько этапов, затем удержание, затем снижение.
 *   - abortOnFail на критичных thresholds для раннего прекращения.
 *
 * Запуск:
 *   k6 run -e BASE_URL=http://localhost:8080 scripts/stress.js
 *   k6 run -e BASE_URL=http://... -e STRESS_MAX_RATE=200 scripts/stress.js
 */

import { CookieJar } from 'k6/http';
import { Trend, Rate } from 'k6/metrics';

import { STRESS_MAX_RATE, MAX_VUS, COMMON_THRESHOLDS } from '../lib/config.js';
import { journeyWeighted } from '../lib/journeys.js';
import { getHome, parseProductIds } from '../lib/api.js';
import { PRODUCTS } from '../lib/data.js';

export const errorRate = new Rate('stress_error_rate');

const maxRate = STRESS_MAX_RATE;  // default 100

export const options = {
  scenarios: {
    stress: {
      executor: 'ramping-arrival-rate',
      startRate: 1,
      timeUnit: '1s',
      preAllocatedVUs: Math.min(50, maxRate),
      maxVUs: MAX_VUS * 2,  // запас для стресса

      stages: [
        // Разогрев
        { target: Math.round(maxRate * 0.1), duration: '2m' },   // 10% от макс.
        { target: Math.round(maxRate * 0.3), duration: '3m' },   // 30%
        { target: Math.round(maxRate * 0.5), duration: '3m' },   // 50%
        { target: Math.round(maxRate * 0.7), duration: '3m' },   // 70%
        // Пик
        { target: maxRate,                    duration: '5m' },   // 100%
        // Перегрузка (120% — ищем срыв)
        { target: Math.round(maxRate * 1.2), duration: '3m' },
        // Восстановление
        { target: Math.round(maxRate * 0.3), duration: '2m' },
        { target: 0,                          duration: '1m' },
      ],
    },
  },

  thresholds: {
    ...COMMON_THRESHOLDS,
    // На стресс-тесте пороги мягче — цель наблюдать, а не обрывать
    'http_req_failed': [{ threshold: 'rate<0.05', abortOnFail: false }],
    'http_req_duration': [{ threshold: 'p(99)<10000', abortOnFail: false }],
    'checkout_success_rate': [{ threshold: 'rate>0.80', abortOnFail: false }],
  },
};

export function setup() {
  const jar = new CookieJar();
  const res = getHome(jar);
  const ids = parseProductIds(res.body || '');
  return { productIds: ids.length > 0 ? ids : PRODUCTS.map(p => p.id) };
}

export default function (data) {
  journeyWeighted(data.productIds);
}

export function handleSummary(data) {
  const m = data.metrics;
  const maxRps    = m.http_reqs?.values?.rate?.toFixed(2) || '?';
  const errRate   = ((m.http_req_failed?.values?.rate || 0) * 100).toFixed(2);
  const p95       = m.http_req_duration?.values?.['p(95)']?.toFixed(0) || '?';
  const p99       = m.http_req_duration?.values?.['p(99)']?.toFixed(0) || '?';
  const maxVus    = m.vus_max?.values?.max || '?';

  console.log('\n============ STRESS TEST SUMMARY ============');
  console.log(`Peak RPS:          ${maxRps} req/s`);
  console.log(`Error rate:        ${errRate}%  ← найдите точку роста`);
  console.log(`p95 duration:      ${p95}ms`);
  console.log(`p99 duration:      ${p99}ms`);
  console.log(`Peak VUs used:     ${maxVus}`);
  console.log(`Checkout success:  ${((m.checkout_success_rate?.values?.rate||0)*100).toFixed(1)}%`);
  console.log('');
  console.log('Интерпретация: ищите момент, когда p99 > 5s или error_rate > 1%');
  console.log('Это и есть предел системы при текущей конфигурации.');
  console.log('=============================================\n');

  return {
    'results/stress-summary.json': JSON.stringify(data, null, 2),
  };
}

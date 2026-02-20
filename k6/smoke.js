/**
 * smoke.js — Smoke-тест
 *
 * Цель: убедиться, что система базово работоспособна.
 * Нагрузка: 2 VU, 2 минуты (по умолчанию).
 * Все 4 основных пути проходят последовательно.
 *
 * Запуск:
 *   k6 run -e BASE_URL=http://localhost:8080 scripts/smoke.js
 */

import { group } from 'k6';
import { Trend } from 'k6/metrics';
import { CookieJar } from 'k6/http';

import { SMOKE_VUS, SMOKE_DURATION, COMMON_THRESHOLDS } from '../lib/config.js';
import {
  getHome, getProduct, addToCart, viewCart, placeOrder,
  setCurrency, healthCheck, parseProductIds,
} from '../lib/api.js';
import {
  checkHome, checkProduct, checkAddToCart, checkViewCart,
  checkCheckout, checkCurrencyChange,
} from '../lib/checks.js';
import { PRODUCTS } from '../lib/data.js';
import { checkoutFormData } from '../lib/data.js';

export const checkoutDuration = new Trend('checkout_duration', true);

export const options = {
  vus:      SMOKE_VUS,
  duration: SMOKE_DURATION,

  thresholds: {
    ...COMMON_THRESHOLDS,
    'http_req_failed': ['rate<0.01'],
    'checkout_success_rate': ['rate>0.90'],
  },
};

// ── Setup: динамическая загрузка product-id ───────────────────────────────────
export function setup() {
  const jar = new CookieJar();
  const res = getHome(jar);
  const ids = parseProductIds(res.body || '');
  console.log(`[smoke] Loaded ${ids.length} product IDs from home page`);
  return { productIds: ids.length > 0 ? ids : PRODUCTS.map(p => p.id) };
}

// ── Основной сценарий ─────────────────────────────────────────────────────────
export default function (data) {
  const { productIds } = data;
  const jar = new CookieJar();

  // Шаг 0: Healthcheck
  group('healthcheck', () => {
    const res = healthCheck();
    // /_healthz возвращает "ok" текст или 200
    // Источник: main.go — router.HandleFunc("/_healthz", ...)
  });

  // Шаг 1: Главная страница
  group('home', () => {
    const res = getHome(jar);
    checkHome(res);
  });

  // Шаг 2: Карточка товара — берём первый из списка для стабильности
  const productId = productIds[0] || 'OLJCESPC7Z';
  group('product', () => {
    const res = getProduct(productId, jar);
    checkProduct(res);
  });

  // Шаг 3: Добавить в корзину
  group('add_to_cart', () => {
    const res = addToCart(productId, 1, jar);
    checkAddToCart(res);
  });

  // Шаг 4: Просмотр корзины
  group('view_cart', () => {
    const res = viewCart(jar);
    checkViewCart(res);
  });

  // Шаг 5: Оформить заказ (end-to-end)
  group('checkout', () => {
    const start = Date.now();
    const res = placeOrder(checkoutFormData(), jar);
    checkoutDuration.add(Date.now() - start);
    checkCheckout(res);
  });

  // Шаг 6: Смена валюты
  group('currency', () => {
    const res = setCurrency('EUR', jar);
    checkCurrencyChange(res);
  });
}

export function handleSummary(data) {
  const passed = data.metrics.http_req_failed &&
    data.metrics.http_req_failed.values.rate < 0.01;

  console.log('\n========== SMOKE TEST SUMMARY ==========');
  console.log(`Status: ${passed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Total requests:  ${data.metrics.http_reqs?.values?.count || 0}`);
  console.log(`Failed requests: ${((data.metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2)}%`);
  console.log(`p95 duration:    ${(data.metrics.http_req_duration?.values?.['p(95)'] || 0).toFixed(0)}ms`);
  console.log(`Checkout success: ${((data.metrics.checkout_success_rate?.values?.rate || 0) * 100).toFixed(1)}%`);
  console.log('=========================================\n');

  return {
    'results/smoke-summary.json': JSON.stringify(data, null, 2),
  };
}

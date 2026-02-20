/**
 * journeys.js — пользовательские сценарии
 *
 * Каждый journey — функция, принимающая текущий список products (может быть
 * динамически получен из parseProductIds) и состояние сессии (jar).
 * Think time применяется только если THINK_TIME_ENABLED=true.
 */

import { sleep } from 'k6';
import { CookieJar } from 'k6/http';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

import { THINK_TIME_ENABLED, THINK_TIME_MIN, THINK_TIME_MAX } from './config.js';
import { randomProduct, randomQuantity, randomCurrency, checkoutFormData } from './data.js';
import {
  getHome, getProduct, addToCart, viewCart, placeOrder, emptyCart,
  setCurrency, parseProductIds,
} from './api.js';
import {
  checkHome, checkProduct, checkAddToCart, checkViewCart,
  checkCheckout, checkCurrencyChange,
} from './checks.js';

// ── Think time helper ─────────────────────────────────────────────────────────
function think() {
  if (THINK_TIME_ENABLED) {
    sleep(THINK_TIME_MIN + Math.random() * (THINK_TIME_MAX - THINK_TIME_MIN));
  }
}

// ── Journey A: Просмотр каталога (browse only) ────────────────────────────────
// Задействует: frontend → productcatalogservice → currencyservice → recommendationservice
export function journeyBrowse(dynamicProducts) {
  const jar = new CookieJar();

  // 1. Главная страница
  const homeRes = getHome(jar);
  checkHome(homeRes);

  // Получаем актуальный список product-id из HTML (с fallback на статику)
  const productIds = dynamicProducts || parseProductIds(homeRes.body || '');

  think();

  // 2. Просмотр 1–3 карточек товаров
  const viewCount = randomIntBetween(1, 3);
  for (let i = 0; i < viewCount; i++) {
    const product = randomProduct(productIds.map(id => ({ id })));
    const productRes = getProduct(product.id, jar);
    checkProduct(productRes);
    if (i < viewCount - 1) think();
  }
}

// ── Journey B: Добавление в корзину + просмотр ────────────────────────────────
// Задействует: frontend → productcatalogservice → cartservice (Redis) → currencyservice
export function journeyAddToCart(dynamicProducts) {
  const jar = new CookieJar();

  // 1. Главная
  const homeRes = getHome(jar);
  checkHome(homeRes);
  const productIds = dynamicProducts || parseProductIds(homeRes.body || '');
  think();

  // 2. Выбрать товар
  const product = randomProduct(productIds.map(id => ({ id })));
  const productRes = getProduct(product.id, jar);
  checkProduct(productRes);
  think();

  // 3. Добавить в корзину (1–3 ед.)
  const qty = randomQuantity();
  const cartRes = addToCart(product.id, qty, jar);
  checkAddToCart(cartRes);
  think();

  // 4. Просмотр корзины
  const viewCartRes = viewCart(jar);
  checkViewCart(viewCartRes);
}

// ── Journey C: Полный checkout (end-to-end) ───────────────────────────────────
// Задействует: frontend → productcatalogservice → cartservice → currencyservice
//              → shippingservice → checkoutservice → paymentservice (mock)
//              → emailservice → orderservice
export function journeyCheckout(dynamicProducts) {
  const jar = new CookieJar();

  // 1. Главная
  const homeRes = getHome(jar);
  checkHome(homeRes);
  const productIds = dynamicProducts || parseProductIds(homeRes.body || '');
  think();

  // 2. Карточка товара
  const product = randomProduct(productIds.map(id => ({ id })));
  const productRes = getProduct(product.id, jar);
  checkProduct(productRes);
  think();

  // 3. Добавить в корзину
  const cartRes = addToCart(product.id, randomQuantity(), jar);
  checkAddToCart(cartRes);
  think();

  // 4. Просмотр корзины
  const viewCartRes = viewCart(jar);
  checkViewCart(viewCartRes);
  think();

  // 5. Оформить заказ
  const formData = checkoutFormData();
  const orderRes = placeOrder(formData, jar);
  checkCheckout(orderRes);
}

// ── Journey D: Смена валюты + просмотр ────────────────────────────────────────
// Задействует: frontend → currencyservice
export function journeyCurrency(dynamicProducts) {
  const jar = new CookieJar();

  // 1. Главная
  const homeRes = getHome(jar);
  checkHome(homeRes);
  const productIds = dynamicProducts || parseProductIds(homeRes.body || '');
  think();

  // 2. Сменить валюту
  const currency = randomCurrency();
  const currRes = setCurrency(currency, jar);
  checkCurrencyChange(currRes);
  think();

  // 3. Просмотр товара в новой валюте
  const product = randomProduct(productIds.map(id => ({ id })));
  const productRes = getProduct(product.id, jar);
  checkProduct(productRes);
}

// ── Мастер-journey: взвешенный выбор для реалистичной нагрузки ────────────────
// Распределение: 40% browse, 30% add_to_cart, 20% checkout, 10% currency
export function journeyWeighted(dynamicProducts) {
  const r = Math.random();
  if (r < 0.40) {
    journeyBrowse(dynamicProducts);
  } else if (r < 0.70) {
    journeyAddToCart(dynamicProducts);
  } else if (r < 0.90) {
    journeyCheckout(dynamicProducts);
  } else {
    journeyCurrency(dynamicProducts);
  }
}

/**
 * api.js — HTTP-обёртки для всех эндпоинтов Online Boutique
 *
 * Все URL и методы подтверждены из src/frontend/main.go (маршрутизация):
 *
 *   router.HandleFunc("/",                    fe.homeHandler).Methods(http.MethodGet)
 *   router.HandleFunc("/product/{id}",        fe.productHandler).Methods(http.MethodGet)
 *   router.HandleFunc("/cart",                fe.addToCartHandler).Methods(http.MethodPost)
 *   router.HandleFunc("/cart",                fe.viewCartHandler).Methods(http.MethodGet)
 *   router.HandleFunc("/cart/checkout",       fe.placeOrderHandler).Methods(http.MethodPost)
 *   router.HandleFunc("/cart/empty",          fe.emptyCartHandler).Methods(http.MethodPost)
 *   router.HandleFunc("/setCurrency",         fe.setCurrencyHandler).Methods(http.MethodPost)
 *   router.HandleFunc("/logout",              fe.logoutHandler).Methods(http.MethodGet)
 *   router.HandleFunc("/_healthz",            ...).Methods(http.MethodGet)
 *
 * Форматы тел подтверждены из handlers.go (r.FormValue("field_name")).
 */

import http from 'k6/http';
import { BASE_URL, httpParams } from './config.js';
import { PRODUCTS } from './data.js';

// ── Парсинг product-id-ов из HTML главной страницы ────────────────────────────
// Ищем href="/product/XXXXXXXX" в разметке
export function parseProductIds(html) {
  const ids = [];
  const re = /href="\/product\/([A-Z0-9]{10})"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }
  return ids.length > 0 ? ids : PRODUCTS.map(p => p.id);
}

// ── GET / — главная страница ──────────────────────────────────────────────────
export function getHome(jar) {
  const params = {
    ...httpParams({ step: 'home', journey: 'browse' }),
    jar,
    redirects: 3,
  };
  return http.get(`${BASE_URL}/`, params);
}

// ── GET /product/{id} — карточка товара ──────────────────────────────────────
export function getProduct(productId, jar) {
  const params = {
    ...httpParams({ step: 'product', journey: 'browse' }),
    jar,
    redirects: 3,
  };
  return http.get(`${BASE_URL}/product/${productId}`, params);
}

// ── POST /cart — добавить товар в корзину ─────────────────────────────────────
// Тело: product_id (string), quantity (int as string)
// Источник: handlers.go addToCartHandler — r.FormValue("product_id"), r.FormValue("quantity")
export function addToCart(productId, quantity, jar) {
  const params = {
    ...httpParams({ step: 'add_to_cart', journey: 'purchase' }),
    jar,
    redirects: 5,   // следуем редиректу на /cart
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };
  return http.post(
    `${BASE_URL}/cart`,
    { product_id: productId, quantity: String(quantity) },
    params,
  );
}

// ── GET /cart — просмотр корзины ──────────────────────────────────────────────
export function viewCart(jar) {
  const params = {
    ...httpParams({ step: 'view_cart', journey: 'purchase' }),
    jar,
    redirects: 3,
  };
  return http.get(`${BASE_URL}/cart`, params);
}

// ── POST /cart/checkout — оформить заказ ──────────────────────────────────────
// Тело (из handlers.go placeOrderHandler, r.FormValue):
//   email, street_address, zip_code, city, state, country,
//   credit_card_number, credit_card_expiration_month,
//   credit_card_expiration_year, credit_card_cvv
export function placeOrder(formData, jar) {
  const params = {
    ...httpParams({ step: 'checkout', journey: 'purchase' }),
    jar,
    redirects: 5,   // 302 → /order?order_id=...
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };
  return http.post(`${BASE_URL}/cart/checkout`, formData, params);
}

// ── POST /cart/empty — очистить корзину ───────────────────────────────────────
export function emptyCart(jar) {
  const params = {
    ...httpParams({ step: 'empty_cart', journey: 'browse' }),
    jar,
    redirects: 3,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };
  return http.post(`${BASE_URL}/cart/empty`, {}, params);
}

// ── POST /setCurrency — смена валюты ──────────────────────────────────────────
// Тело: currency_code (string, напр. "EUR")
// Источник: handlers.go setCurrencyHandler — r.FormValue("currency_code")
export function setCurrency(currencyCode, jar) {
  const params = {
    ...httpParams({ step: 'set_currency', journey: 'browse' }),
    jar,
    redirects: 3,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  };
  return http.post(`${BASE_URL}/setCurrency`, { currency_code: currencyCode }, params);
}

// ── GET /_healthz — healthcheck (для smoke) ───────────────────────────────────
export function healthCheck() {
  const params = httpParams({ step: 'healthz', journey: 'infra' });
  return http.get(`${BASE_URL}/_healthz`, params);
}

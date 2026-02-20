/**
 * checks.js — общие проверки ответов
 *
 * Коды статуса подтверждены из src/frontend/handlers.go:
 *   - GET /           → 200 (homeHandler)
 *   - GET /product/*  → 200 (productHandler)
 *   - POST /cart      → 302 redirect (addToCartHandler)
 *   - GET /cart       → 200 (viewCartHandler)
 *   - POST /cart/checkout → 302 → GET /order (placeOrderHandler)
 *   - POST /setCurrency  → 302 redirect (setCurrencyHandler)
 */

import { check } from 'k6';
import { Rate, Counter } from 'k6/metrics';

// ── Пользовательские метрики ──────────────────────────────────────────────────
export const checkoutSuccessRate = new Rate('checkout_success_rate');
export const checkoutErrors      = new Counter('checkout_errors');
export const cartErrors          = new Counter('cart_errors');

// ── Утилита: check + fail-message ─────────────────────────────────────────────
export function checkResponse(res, name, extraChecks = {}) {
  const passed = check(res, {
    [`${name}: status not 4xx/5xx`]: (r) => r.status < 400 || r.status === 302,
    ...extraChecks,
  });
  return passed;
}

// ── Специфические проверки ────────────────────────────────────────────────────
export function checkHome(res) {
  return check(res, {
    'home: status 200':          (r) => r.status === 200,
    'home: contains products':   (r) => r.body && r.body.includes('class="hot-product-card"'),
    'home: contains currency':   (r) => r.body && (r.body.includes('USD') || r.body.includes('EUR')),
  });
}

export function checkProduct(res) {
  return check(res, {
    'product: status 200':       (r) => r.status === 200,
    'product: has add-to-cart':  (r) => r.body && r.body.includes('addToCart'),
    'product: has price':        (r) => r.body && r.body.includes('price'),
  });
}

export function checkAddToCart(res) {
  const ok = check(res, {
    // addToCartHandler делает http.Redirect → 302 или следуем редиректу → 200
    'add_to_cart: status 2xx/3xx': (r) => r.status >= 200 && r.status < 400,
  });
  if (!ok) cartErrors.add(1);
  return ok;
}

export function checkViewCart(res) {
  return check(res, {
    'cart: status 200':         (r) => r.status === 200,
    'cart: has items or empty': (r) => r.body && (
      r.body.includes('cart-item') || r.body.includes('Your shopping cart is empty')
    ),
  });
}

export function checkCheckout(res) {
  // placeOrderHandler: успех → 302 → /order?order_id=...
  // При следовании редиректу: 200 + "Your order is complete"
  const ok = check(res, {
    'checkout: status 2xx': (r) => r.status >= 200 && r.status < 400,
    'checkout: order complete': (r) => r.body && (
      r.body.includes('order') || r.body.includes('Order #') || r.body.includes('Your order is')
    ),
  });
  checkoutSuccessRate.add(ok ? 1 : 0);
  if (!ok) checkoutErrors.add(1);
  return ok;
}

export function checkCurrencyChange(res) {
  return check(res, {
    'currency: redirect or 200': (r) => r.status >= 200 && r.status < 400,
  });
}

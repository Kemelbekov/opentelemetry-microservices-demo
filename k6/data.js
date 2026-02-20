/**
 * data.js — тестовые данные и продукты
 *
 * Источник product ID-ов:
 *   src/productcatalogservice/products.json (hardcoded catalog в proto-based сервисе)
 *   Файл: https://github.com/GoogleCloudPlatform/microservices-demo/blob/main/
 *          src/productcatalogservice/products.json
 *
 * Дополнительно: динамическая загрузка из home-страницы (см. parseProductIds в api.js).
 * Здесь — статический fallback для случаев, когда парсинг недоступен.
 *
 * Поля checkout-формы подтверждены из:
 *   src/frontend/handlers.go — func (fe *frontendServer) placeOrderHandler
 *   Поля: email, street_address, zip_code, city, state, country,
 *          credit_card_number, credit_card_expiration_month,
 *          credit_card_expiration_year, credit_card_cvv
 *
 * Валюты подтверждены из:
 *   src/frontend/handlers.go — func (fe *frontendServer) setCurrencyHandler
 *   src/currencyservice/data/currency_conversion.json
 */

import { randomItem, randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// ── Статический каталог товаров (seed из products.json) ───────────────────────
export const PRODUCTS = [
  { id: 'OLJCESPC7Z', name: 'Sunglasses',             price: 19.99 },
  { id: '66VCHSJNUP', name: 'Tank Top',                price: 18.99 },
  { id: '1YMWWN1N4O', name: 'Watch',                   price: 109.99 },
  { id: 'L9ECAV7KIM', name: 'Loafers',                 price: 89.99 },
  { id: '2ZYFJ3GM2N', name: 'Hairdryer',               price: 24.99 },
  { id: '0PUK6V6EV0', name: 'Candle Holder',           price: 18.99 },
  { id: 'LS4PSXUNUM', name: 'Salt & Pepper Shakers',   price: 18.49 },
  { id: '9SIQT8TOJO', name: 'Bamboo Glass Jar',        price: 5.49  },
  { id: '6E92ZMYYFZ', name: 'Mug',                     price: 8.99  },
];

// ── Поддерживаемые валюты (src/currencyservice/data/currency_conversion.json) ──
export const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'CHF'];

// ── Тестовые адреса для checkout ──────────────────────────────────────────────
const ADDRESSES = [
  {
    street_address: '1600 Amphitheatre Pkwy',
    zip_code: '94043',
    city: 'Mountain View',
    state: 'CA',
    country: 'United States',
  },
  {
    street_address: '221B Baker Street',
    zip_code: 'NW1 6XE',
    city: 'London',
    state: 'England',
    country: 'United Kingdom',
  },
  {
    street_address: '350 Fifth Avenue',
    zip_code: '10118',
    city: 'New York',
    state: 'NY',
    country: 'United States',
  },
];

// Тестовые карты — используются только с mock payment service
// (src/paymentservice/ — это заглушка, не требует реальных данных)
const CREDIT_CARDS = [
  { number: '4432-8015-6152-0454', month: '1', year: '2030', cvv: '672' },
  { number: '4111111111111111',     month: '6', year: '2028', cvv: '123' },
  { number: '5500005555555559',     month: '12', year: '2027', cvv: '456' },
];

// ── Хелперы рандомизации ──────────────────────────────────────────────────────
export function randomProduct(productList) {
  const list = (productList && productList.length > 0) ? productList : PRODUCTS;
  return randomItem(list);
}

export function randomQuantity() {
  return randomIntBetween(1, 3);
}

export function randomAddress() {
  return randomItem(ADDRESSES);
}

export function randomCard() {
  return randomItem(CREDIT_CARDS);
}

export function randomCurrency() {
  return randomItem(CURRENCIES);
}

// ── Генерация данных для checkout-формы ───────────────────────────────────────
export function checkoutFormData(email) {
  const addr = randomAddress();
  const card = randomCard();
  return {
    email:                        email || `user_${randomIntBetween(1000, 9999)}@example.com`,
    street_address:               addr.street_address,
    zip_code:                     addr.zip_code,
    city:                         addr.city,
    state:                        addr.state,
    country:                      addr.country,
    credit_card_number:           card.number,
    credit_card_expiration_month: card.month,
    credit_card_expiration_year:  card.year,
    credit_card_cvv:              card.cvv,
  };
}

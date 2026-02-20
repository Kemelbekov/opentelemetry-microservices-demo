# 🔧 Нагрузочное тестирование — Online Boutique (microservices-demo)
<!-- 
# 2. Smoke — убедиться что всё работает
k6 run -e BASE_URL=$BASE_URL loadtest/scripts/smoke.js

# 3. Load — целевая нагрузка (10 RPS, 5 мин)
k6 run -e BASE_URL=$BASE_URL loadtest/scripts/load.js

# 4. Stress — найти предел
k6 run -e BASE_URL=$BASE_URL -e STRESS_MAX_RATE=200 loadtest/scripts/stress.js

# 5. Soak — стабильность (30 мин)
k6 run -e BASE_URL=$BASE_URL -e SOAK_DURATION=30m loadtest/scripts/soak.js

#в load/soak — гарантирует фиксированный RPS независимо от latency сервера
#в stress — ступенчатый рост для точного определения точки деградации
#Взвешенный journey: 40% browse / 30% cart / 20% checkout / 10% currency — реалистичная смесь сценариев 
-->

Набор k6-скриптов для нагрузочного тестирования [Google Cloud Online Boutique](https://github.com/GoogleCloudPlatform/microservices-demo) — сквозная нагрузка через публичный `frontend` с покрытием всех микросервисов.


---

## Архитектура тестов

```
loadtest/
├── README.md
├── scripts/
│   ├── smoke.js       A) Дымовой — 2 VU, 2 мин
│   ├── load.js        B) Целевая нагрузка — constant-arrival-rate
│   ├── stress.js      C) Стресс — ramping-arrival-rate до деградации
│   └── soak.js        D) Долгосрочный — 30–120 мин
└── lib/
    ├── config.js      Все env-параметры и дефолты
    ├── api.js         HTTP-обёртки для каждого эндпоинта
    ├── journeys.js    Пользовательские сценарии
    ├── data.js        Товары, адреса, карты, валюты
    └── checks.js      Проверки ответов и кастомные метрики
```

---

## Предварительные условия

| Инструмент | Версия     | Проверка              |
|------------|------------|----------------------|
| k6         | ≥ 0.46.0   | `k6 version`         |
| minikube   | ≥ 1.32     | для локального k8s   |
| kubectl    | ≥ 1.28     | `kubectl version`    |
| skaffold   | ≥ 2.x      | (опционально)        |

Установка k6: https://k6.io/docs/get-started/installation/

---

## Поднятие системы

### Способ 1: Готовые манифесты (рекомендуется)

```bash
git clone https://github.com/GoogleCloudPlatform/microservices-demo
cd microservices-demo

# Запустить minikube
minikube start --cpus=4 --memory=8192

# Применить все манифесты
kubectl apply -f kubernetes-manifests/

# Дождаться готовности всех подов (2–5 минут)
kubectl wait --for=condition=Ready pods --all --timeout=300s

# Получить URL фронтенда
minikube service frontend-external --url
# → http://192.168.49.2:XXXXX (сохранить как BASE_URL)
```

### Способ 2: Skaffold (dev-режим с hot-reload)

```bash
skaffold run --default-repo=gcr.io/$(gcloud config get-value project)
kubectl get svc frontend-external
```

### Способ 3: GKE (Google Cloud)

```bash
gcloud container clusters create demo --num-nodes=3 --zone=us-central1-c
kubectl apply -f kubernetes-manifests/
kubectl get svc frontend-external  # EXTERNAL-IP
```

> **Проверка:** `curl -s -o /dev/null -w "%{http_code}" $BASE_URL/` должен вернуть `200`

---

## Эндпоинты (подтверждено из кода)

| Метод  | Путь                | Источник в репо                   | Описание                  |
|--------|---------------------|-----------------------------------|---------------------------|
| GET    | `/`                 | `src/frontend/main.go:homeHandler`        | Главная / каталог         |
| GET    | `/product/{id}`     | `src/frontend/main.go:productHandler`     | Карточка товара           |
| POST   | `/cart`             | `src/frontend/main.go:addToCartHandler`   | Добавить в корзину        |
| GET    | `/cart`             | `src/frontend/main.go:viewCartHandler`    | Просмотр корзины          |
| POST   | `/cart/checkout`    | `src/frontend/main.go:placeOrderHandler`  | Оформить заказ            |
| POST   | `/cart/empty`       | `src/frontend/main.go:emptyCartHandler`   | Очистить корзину          |
| POST   | `/setCurrency`      | `src/frontend/main.go:setCurrencyHandler` | Сменить валюту            |
| GET    | `/_healthz`         | `src/frontend/main.go`                    | Healthcheck               |

### Форматы тел запросов

**POST /cart** (`application/x-www-form-urlencoded`):
```
product_id=OLJCESPC7Z&quantity=2
```

**POST /cart/checkout** (`application/x-www-form-urlencoded`):
```
email=user@example.com&street_address=...&zip_code=...&city=...&state=...
&country=...&credit_card_number=...&credit_card_expiration_month=...
&credit_card_expiration_year=...&credit_card_cvv=...
```

**POST /setCurrency** (`application/x-www-form-urlencoded`):
```
currency_code=EUR
```

---

## Запуск тестов

### A) Smoke — быстрая проверка работоспособности

```bash
export BASE_URL=http://192.168.49.2:32000

k6 run -e BASE_URL=$BASE_URL scripts/smoke.js
```

### B) Load — целевая нагрузка

```bash
# Дефолт: 10 RPS, 5 минут
k6 run -e BASE_URL=$BASE_URL scripts/load.js

# С параметрами:
k6 run \
  -e BASE_URL=$BASE_URL \
  -e RATE=20 \
  -e DURATION=10m \
  -e MAX_VUS=200 \
  -e PRE_ALLOC=50 \
  scripts/load.js
```

### C) Stress — поиск предела

```bash
# Дефолт: пик до 100 RPS, ступенями
k6 run -e BASE_URL=$BASE_URL scripts/stress.js

# Поднять потолок:
k6 run -e BASE_URL=$BASE_URL -e STRESS_MAX_RATE=300 -e MAX_VUS=500 scripts/stress.js
```

### D) Soak — долгосрочная стабильность

```bash
# Дефолт: 5 RPS, 30 минут
k6 run -e BASE_URL=$BASE_URL scripts/soak.js

# Боевой прогон — 2 часа:
k6 run -e BASE_URL=$BASE_URL -e SOAK_RATE=10 -e SOAK_DURATION=120m scripts/soak.js
```

---

## Все ENV-переменные

| Переменная        | Дефолт     | Описание                                    |
|-------------------|------------|---------------------------------------------|
| `BASE_URL`        | `http://localhost:8080` | URL фронтенда (без trailing slash) |
| `RATE`            | `10`       | Target RPS (iterations/sec) для load.js     |
| `DURATION`        | `5m`       | Длительность load.js                        |
| `PRE_ALLOC`       | `20`       | Prealloc VUs для arrival-rate executor      |
| `MAX_VUS`         | `100`      | Максимум VUs                                |
| `VUS`             | `20`       | VUs для VU-based сценариев                  |
| `SMOKE_VUS`       | `2`        | VUs для smoke.js                            |
| `SMOKE_DURATION`  | `2m`       | Длительность smoke.js                       |
| `STRESS_MAX_RATE` | `100`      | Пиковый RPS для stress.js                   |
| `SOAK_RATE`       | `5`        | RPS для soak.js                             |
| `SOAK_DURATION`   | `30m`      | Длительность soak.js                        |
| `THINK_TIME`      | `1`        | `0` = отключить паузы (ускорить тест)       |
| `THINK_TIME_MIN`  | `0.5`      | Минимальная пауза (сек)                     |
| `THINK_TIME_MAX`  | `2.0`      | Максимальная пауза (сек)                    |
| `TIMEOUT_READ`    | `10s`      | HTTP read timeout                           |
| `TIMEOUT_CONNECT` | `5s`       | HTTP connect timeout                        |

---

## Интерпретация результатов

### Ключевые метрики

| Метрика                          | Хорошо        | Требует внимания | Критично    |
|----------------------------------|---------------|-----------------|-------------|
| `http_req_failed rate`           | < 0.1%        | 0.1–1%          | > 1%        |
| `http_req_duration p(95)`        | < 1s          | 1–2s            | > 2s        |
| `http_req_duration p(99)`        | < 2s          | 2–5s            | > 5s        |
| `checkout_duration p(95)`        | < 3s          | 3–6s            | > 6s        |
| `checkout_success_rate`          | > 99%         | 95–99%          | < 95%       |

### Тегированные срезы

В k6 Dashboard или InfluxDB + Grafana фильтруйте по:
- `tag:step` — разрез по шагу (home, product, add_to_cart, checkout...)
- `tag:journey` — разрез по сценарию (browse, purchase)

### HTML-отчёт (опционально)

Для генерации HTML-отчёта используйте [`k6-reporter`](https://github.com/benc-uk/k6-reporter):

```bash
# Запуск с генерацией JSON для репортера
k6 run --out json=results/raw.json scripts/load.js

# Конвертация через k6-reporter (Node.js)
npx k6-reporter results/raw.json
```

Или встроенный web dashboard (k6 ≥ 0.48):

```bash
K6_WEB_DASHBOARD=true k6 run -e BASE_URL=$BASE_URL scripts/load.js
# Открыть: http://localhost:5665
```

---

## Подключение к CI

### GitHub Actions

```yaml
# .github/workflows/load-test.yml
name: Load Test

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      rate:
        description: 'Target RPS'
        default: '10'
      duration:
        description: 'Test duration'
        default: '5m'

jobs:
  smoke:
    name: Smoke Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install k6
        run: |
          sudo gpg -k
          sudo gpg --no-default-keyring \
            --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
            --keyserver hkp://keyserver.ubuntu.com:80 \
            --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
          echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] \
            https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
          sudo apt-get update && sudo apt-get install k6

      - name: Run Smoke Test
        env:
          BASE_URL: ${{ secrets.STAGING_URL }}
        run: |
          cd loadtest
          k6 run -e BASE_URL=$BASE_URL scripts/smoke.js

      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: k6-results
          path: loadtest/results/

  load:
    name: Load Test
    needs: smoke
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4
      - name: Install k6
        run: |
          sudo apt-get update && sudo apt-get install -y k6 || \
          (curl -sL https://dl.k6.io/sh/install.sh | sudo bash)

      - name: Run Load Test
        env:
          BASE_URL: ${{ secrets.STAGING_URL }}
          RATE: ${{ github.event.inputs.rate || '10' }}
          DURATION: ${{ github.event.inputs.duration || '5m' }}
        run: |
          cd loadtest
          k6 run \
            -e BASE_URL=$BASE_URL \
            -e RATE=$RATE \
            -e DURATION=$DURATION \
            scripts/load.js
```

### GitLab CI

```yaml
# .gitlab-ci.yml (фрагмент)
load-test:
  stage: test
  image: grafana/k6:latest
  script:
    - cd loadtest
    - k6 run -e BASE_URL=$STAGING_URL -e RATE=10 -e DURATION=5m scripts/load.js
  artifacts:
    when: always
    paths:
      - loadtest/results/
    expire_in: 7 days
  variables:
    STAGING_URL: "http://your-staging-host"
  only:
    - main
```

---

## Масштабирование нагрузки

### Как не убить локальное окружение

- Для **smoke** и **load** с RATE ≤ 20: minikube с 4 CPU / 8 GB достаточно.
- Для **stress** с RATE > 50: рекомендуется GKE/EKS с HPA включённым.
- Мониторьте ресурсы: `kubectl top pods -A` параллельно с тестом.
- Установите `resource limits` в манифестах перед стресс-тестом.

### Распределённый запуск (k6 Cloud / Operator)

```bash
# k6 Cloud (SaaS)
k6 cloud -e BASE_URL=https://your-public-url scripts/load.js

# k6 Operator (Kubernetes)
kubectl apply -f https://raw.githubusercontent.com/grafana/k6-operator/main/bundle.yaml
# Затем создать TestRun CRD
```

### Grafana + InfluxDB (real-time метрики)

```bash
# Запуск с отправкой в InfluxDB
k6 run \
  --out influxdb=http://localhost:8086/k6 \
  -e BASE_URL=$BASE_URL \
  scripts/load.js

# Dashboard ID для Grafana: 2587 (официальный k6 dashboard)
```

---

## Заметки по реализации

### Checkout без капчи / внешних зависимостей

`paymentservice` в Online Boutique — это **mock** (src/paymentservice/index.js), принимающий любые данные карты. Никакой реальной платёжной системы нет. Checkout работает полностью в изолированном окружении.

### Корреляция данных

- `product_id` извлекается **динамически** из HTML главной страницы через регулярное выражение в `setup()`. Это гарантирует актуальность данных при обновлении каталога.
- `session` поддерживается через `CookieJar` — каждый VU имеет свою сессию и корзину.
- Нет CSRF-токенов в стандартной конфигурации (подтверждено изучением handlers.go).

### Think time

По умолчанию включён (0.5–2.0 сек). Для максимальной нагрузки:
```bash
k6 run -e BASE_URL=$BASE_URL -e THINK_TIME=0 scripts/load.js
```

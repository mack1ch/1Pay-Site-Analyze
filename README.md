# Site Text Extractor + Screenshots + Crawler + Forbidden Smart Scanner

Веб-приложение для извлечения читаемого текста со страниц, скриншотов, краулинга и проверки страниц на наличие запрещённых терминов с умным матчингом (стемминг, опционально fuzzy).

## Возможности

- **Input**: список URL (textarea или CSV) или один seed URL с краулингом (BFS, maxPages, maxDepth, sameHostOnly, include/exclude patterns).
- **Forbidden terms**: список запрещённых слов/фраз; поиск с режимами: exact_substring, word, smart_stem (Snowball RU/EN), smart_fuzzy (Damerau–Levenshtein для опечаток); phraseMode token_stem_sequence; languageMode auto/ru/en.
- **Извлечение текста**: JSDOM + Readability + fallback (очистка DOM), нормализация, лимит символов.
- **Скриншоты**: Playwright (Chromium), пул браузера, хранение в `server/storage/screenshots/`.
- **Результаты**: таблица с превью, статус, Violations badge, View Text / View Matches модалки, экспорт JSONL/CSV и отдельный Export violations report CSV.
- **История проверок**: страница «История проверок» в шапке — список доменов, по которым уже были отчёты, и все сохранённые отчёты по каждому домену. Данные хранятся в PostgreSQL (опционально).

## Стек

- **Frontend**: React 18, TypeScript, Vite.
- **Backend**: Node.js, TypeScript, Fastify.
- **Скриншоты**: Playwright (chromium).
- **Текст**: undici, JSDOM, @mozilla/readability.
- **Forbidden scanner**: snowball-stemmers (RU/EN), damerau-levenshtein (fuzzy).
- **Очереди**: p-limit.
- **История**: PostgreSQL (pg) — при заданной переменной `DATABASE_URL` завершённые проверки сохраняются в БД; без БД приложение работает как раньше, раздел «История проверок» будет пустым.
- **Тесты**: Vitest (server).

## Запуск

### Требования

- Node.js >= 18
- pnpm

### Установка

```bash
pnpm install
```

### Playwright (браузер для скриншотов)

```bash
cd server && pnpm exec playwright install chromium
```

### Режим разработки (без сборки, изменения сразу)

Запуск **без Docker** — без пересборки образа, с горячей перезагрузкой.

**Важно:** запускайте из **корня проекта** (не из `server/`), чтобы поднялись и API, и интерфейс:

```bash
# из корня проекта (не из server/)
pnpm dev
```

- **API**: http://localhost:3000 (сервер перезапускается при изменении файлов в `server/`)
- **Клиент**: http://localhost:5173 (Vite HMR — правки в `client/` отображаются сразу)

Откройте в браузере **http://localhost:5173** (не 3000 — в dev интерфейс отдаёт Vite). Меняйте код — клиент обновится без перезагрузки, сервер перезапустится сам.

### Docker (всё одной командой)

```bash
pnpm docker:up
```

или:

```bash
docker compose up --build
```

После сборки приложение доступно по адресу **http://localhost:3000** (и API, и интерфейс). Скриншоты сохраняются в volume `screenshots`. Остановка: `pnpm docker:down` или `Ctrl+C` и `docker compose down`.

### История проверок (PostgreSQL)

Чтобы сохранять отчёты и показывать их в разделе «История проверок», задайте переменную окружения **`DATABASE_URL`** (строка подключения к PostgreSQL). При старте сервера таблицы `check_reports` и `check_report_domains` создаются автоматически.

Пример для разработки (Docker):

```bash
# Запуск PostgreSQL в контейнере
docker run -d --name 1pay-pg -e POSTGRES_PASSWORD=local -e POSTGRES_DB=mon -p 5432:5432 postgres:16

# Запуск приложения с БД
DATABASE_URL=postgresql://postgres:local@localhost:5432/mon pnpm dev
```

Без `DATABASE_URL` история не сохраняется и страница «История проверок» остаётся пустой.

### Расписания и уведомления в Telegram

В разделе **«Расписания»** (в шапке) можно настроить автоматический обход сайтов по cron (например, каждый день в 09:00 или каждые 6 часов). Требуется **PostgreSQL** (`DATABASE_URL`).

При обнаружении проблем (запрещённые слова, блокировка 403/429, ошибки загрузки) отправляется уведомление в **Telegram** с текстом: сайт, найденные слова, ссылка на отчёт.

Переменные окружения сервера (или укажите в настройках расписания):

- **`TELEGRAM_BOT_TOKEN`** — токен бота (создать через [@BotFather](https://t.me/BotFather)).
- **`TELEGRAM_CHAT_ID`** — ID чата (например, от [@userinfobot](https://t.me/userinfobot)).
- **`BASE_URL`** — публичный URL приложения (для ссылки «Открыть отчёт» в сообщении).

Пример `.env` (см. `.env.example`):

```
DATABASE_URL=postgresql://postgres:local@localhost:5432/mon
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_CHAT_ID=860003314
BASE_URL=https://your-domain.com
```

Формат cron: минута час день месяц день_недели. Примеры: `0 9 * * *` — каждый день в 09:00; `0 9,18 * * *` — в 09:00 и 18:00; `0 9 * * 1-5` — по будням в 09:00.

### Сборка и тесты

```bash
pnpm build
pnpm test
pnpm lint
```

### Деплой на production

Инструкция по выкладке на сервер с доменом и HTTPS: **[docs/DEPLOY.md](docs/DEPLOY.md)**.

## API (job-based)

| Метод | Путь | Описание |
|-------|------|----------|
| POST | `/api/jobs` | Создать джобу. Body: `{ mode, urls?, seedUrl?, options }`. Ответ: `{ jobId }`. |
| GET | `/api/jobs/:jobId` | `{ status, progress, summary }`. |
| GET | `/api/jobs/:jobId/results?cursor=&limit=` | `{ items, nextCursor? }`. |
| POST | `/api/jobs/:jobId/cancel` | `{ ok: true }`. |
| GET | `/api/history/domains` | Список доменов с историей: `{ domains: [{ domain, reportCount, lastCheckedAt }] }`. |
| GET | `/api/history/domains/:domain/reports` | Отчёты по домену: `{ reports: [{ jobId, createdAt, mode, summary }] }`. |
| GET | `/api/schedules` | Список расписаний. |
| POST | `/api/schedules` | Создать расписание (body: name, mode, seedUrl/urls, cronExpression, timezone, endAt?, forbiddenTerms?, telegramChatId?, telegramBotToken?, enabled). |
| PUT | `/api/schedules/:id` | Обновить расписание. |
| DELETE | `/api/schedules/:id` | Удалить расписание. |

**options** (сокращённо): `concurrencyFetch`, `concurrencyScreenshots`, `maxChars`, `maxResponseBytes`, `screenshot: { enabled, fullPage }`, `crawl: { crawlMode, maxPages, maxDepth, sameHostOnly, includePatterns?, excludePatterns? }`, `forbidden: { terms: string[], settings }`.

**ResultItem** включает `forbiddenScan?: { hasMatches, totalMatches, matchedTerms[] }` с полями term, count, matchType, normalizedTerm, snippets.

## Режимы matchMode (forbidden)

- **exact_substring** — вхождение подстроки в текст.
- **word** — совпадение целых слов (токенов).
- **smart_stem** (по умолчанию) — приведение к базовой форме (Snowball): например «арбуз» находит «арбузы», «арбузами»; «run» находит «running», «runs». Возможны ложные срабатывания из-за стемминга.
- **smart_fuzzy** — сначала стемминг; если нет матча — поиск по Damerau–Levenshtein (distance ≤ 1) для слов длины 4–20. Помечается как «possible typo match».

## Безопасность и ограничения

- **SSRF**: блокируются localhost, 127.0.0.1, ::1, частные диапазоны (10/8, 172.16/12, 192.168/16), link-local и metadata IP. Проверка по DNS до запроса и по finalUrl после редиректов.
- **Лимиты**: таймаут fetch ~25s, maxResponseBytes, maxChars текста, лимит редиректов.
- **Playwright**: один браузер, пул страниц, без сохранения cookies между доменами.

## Примеры CSV

### URLs (колонка url или link)

```csv
url,title
https://example.com/page1,Page One
https://example.com/page2,Page Two
```

Или один URL на строку, или колонка `link`.

### Forbidden terms (один термин на строку, или первая колонка)

```csv
term
арбуз
запрещённое_слово
running
```

Или без заголовка — по одному термину в строке.

## Архитектура

- **Monorepo**: `client/`, `server/` (pnpm workspaces).
- **Сервер**: job state в памяти; процессор: fetch → SSRF → HTML parse → Readability/fallback → скриншот (пул Playwright) → forbidden scanner (tokenize → stem/fuzzy/phrase) → append result, progress.violations, setJobSummary при завершении.
- **Краулер**: BFS, normalize URL, sameHostOnly, includePatterns/excludePatterns (массивы regex).
- **Клиент**: секции Input, Forbidden terms, Run controls, Results (таблица, Violations Summary, экспорты, модалки View Text / View Matches / Screenshot).

## Лицензия

MIT.

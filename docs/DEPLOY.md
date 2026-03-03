# Деплой на production (сервер и домен)

Краткая инструкция по выкладке приложения на сервер с доменом и HTTPS.

## 1. Переменные окружения

Скопируйте `.env.example` в `.env` на сервере и заполните:

| Переменная | Обязательно | Описание |
|------------|--------------|----------|
| `PORT` | Нет (по умолчанию 3000) | Порт приложения. Задайте другой (например `8080`), если 3000 занят или нужен иной порт. |
| `DATABASE_URL` | Для истории и расписаний | Строка подключения PostgreSQL, например `postgresql://user:password@host:5432/dbname`. Без неё история проверок и расписания недоступны. |
| `BASE_URL` | Для Telegram-уведомлений | Публичный URL приложения, например `https://mon.example.com`. Нужен для ссылки «Открыть отчёт» в уведомлениях. |
| `TELEGRAM_BOT_TOKEN` | Для уведомлений | Токен бота (получить у [@BotFather](https://t.me/BotFather)). |
| `TELEGRAM_CHAT_ID` | Для уведомлений | ID чата (например, через [@userinfobot](https://t.me/userinfobot)). |

Минимальный production без истории и Telegram: переменные не задавать — приложение будет работать на порту 3000 (или на том, что задан в `PORT`).

## 2. Сборка и запуск через Docker (рекомендуется)

На сервере с установленным Docker и Docker Compose:

```bash
# Клонировать репозиторий (или скопировать файлы)
cd /path/to/1pay_site_mon

# Создать .env (обязательно — иначе docker compose выдаст ошибку env_file)
cp .env.example .env
nano .env   # заполнить DATABASE_URL, BASE_URL, TELEGRAM_* по необходимости (можно оставить закомментированным)

# Собрать и запустить
docker compose up -d --build
```

Приложение будет доступно на порту из переменной **`PORT`** (по умолчанию 3000). Например, задав в `.env` строку `PORT=8080`, откройте http://localhost:8080. Скриншоты сохраняются в Docker volume `screenshots`.

Передать переменные в контейнер можно так:

- **Вариант A:** Файл `.env` в корне проекта — тогда в `docker-compose.yml` добавьте:
  ```yaml
  env_file: .env
  ```
- **Вариант B:** Явно в `docker-compose.yml` в секции `environment` (не коммитьте пароли в репозиторий).

Пример с `env_file` уже описан в обновлённом `docker-compose.yml`.

## 3. Nginx перед приложением (домен и HTTPS)

Чтобы открывать приложение по домену и использовать HTTPS (Let's Encrypt), поставьте Nginx как обратный прокси.

1. Установите Nginx и certbot (если ещё не установлены):
   ```bash
   # Ubuntu/Debian
   sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx
   ```

2. Создайте конфиг сайта, например `/etc/nginx/sites-available/mon`:

   ```nginx
   server {
       listen 80;
       server_name mon.example.com;   # замените на ваш домен

       location / {
           proxy_pass http://127.0.0.1:3000;   # укажите тот же порт, что и PORT в .env (например 8080)
           proxy_http_version 1.1;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```

3. Включите сайт и получите сертификат:
   ```bash
   sudo ln -s /etc/nginx/sites-available/mon /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d mon.example.com
   ```

4. В `.env` укажите:
   ```
   BASE_URL=https://mon.example.com
   ```

После этого приложение доступно по `https://mon.example.com`. Health-check для балансировщиков и мониторинга: `GET /api/health` (возвращает 200 и `{"ok":true}`).

## 4. Запуск без Docker (systemd)

Если запускаете Node.js напрямую на сервере:

1. Установите зависимости и соберите проект (Node.js >= 18, pnpm):
   ```bash
   pnpm install
   pnpm build
   cd server && npx playwright install chromium
   ```

2. Создайте unit-файл `/etc/systemd/system/1pay-site-mon.service`:

   ```ini
   [Unit]
   Description=1pay site monitor
   After=network.target postgresql.service

   [Service]
   Type=simple
   User=www-data
   WorkingDirectory=/path/to/1pay_site_mon
   EnvironmentFile=/path/to/1pay_site_mon/.env
   ExecStart=/usr/bin/node server/dist/index.js
   Restart=on-failure
   RestartSec=5

   [Install]
   WantedBy=multi-user.target
   ```

3. Запустите и включите автозапуск:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable 1pay-site-mon
   sudo systemctl start 1pay-site-mon
   ```

Клиент должен быть собран и лежать в `server/public/` (это делает `pnpm build` в корне).

## 5. Проверка перед выкладкой

- Локально: `pnpm build && pnpm test && pnpm lint`
- Docker: `docker compose up --build` — открыть http://localhost:3000 и проверить интерфейс и одну проверку
- После деплоя: открыть `https://ваш-домен/api/health` — должен быть ответ `{"ok":true}`

## 6. Обновление на сервере

```bash
git pull   # или скопировать новые файлы
docker compose up -d --build
# или при systemd: пересобрать, затем systemctl restart 1pay-site-mon
```

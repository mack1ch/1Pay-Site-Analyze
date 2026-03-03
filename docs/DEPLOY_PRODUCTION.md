# Деплой на прод: sitechecker.paymentgames.ru

Пошаговые команды для пуша проекта на GitHub и развёртывания на сервере **185.55.58.62** с доменом **sitechecker.paymentgames.ru** и БД Selectel **onepayment_site_analyze**.

---

## Часть 1: Пуш кода на GitHub (у себя локально)

Выполняй в каталоге проекта на своём компьютере.

```bash
cd /Users/mack1ch/Documents/development/1pay_site_mon

# Проверить, что всё закоммичено и репозиторий привязан к нужному remote
git status
git remote -v
# Если remote не настроен:
# git remote add origin https://github.com/mack1ch/1Pay-Site-Analyze.git

# Закоммитить изменения (если есть незакоммиченные)
git add -A
git status
git commit -m "Deploy: production env and Selectel DB support"   # или своё сообщение

# Пуш в ветку main (или master — смотри какая у тебя default)
git push -u origin main
# если основная ветка master:
# git push -u origin master
```

---

## Часть 2: Подготовка сервера (один раз)

Подключись по SSH к серверу (подставь своего пользователя, например `root` или `deploy`):

```bash
ssh root@185.55.58.62
```

### 2.1 Установка Docker и Docker Compose

```bash
sudo apt update && sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${VERSION_CODENAME:-jammy}") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update && sudo apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable docker && sudo systemctl start docker
```

### 2.2 Установка Nginx и Certbot (для домена и HTTPS)

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

### 2.3 Клонирование репозитория

Выбери каталог для приложения, например `/var/www/sitechecker` или домашний каталог:

```bash
sudo mkdir -p /var/www
sudo chown $USER:$USER /var/www
cd /var/www
git clone https://github.com/mack1ch/1Pay-Site-Analyze.git sitechecker
cd sitechecker
```

---

## Часть 3: Настройка БД Selectel

БД: **onepayment_site_analyze**  
Кластер (пример): **52cdf1c0-dabf-4a66-90cb-1d30c24db178**

В панели Selectel возьми:
- **Хост** — что-то вроде `master.52cdf1c0-dabf-4a66-90cb-1d30c24db178.c.dbaas.selcloud.ru`
- **Порт** — 5432
- **Имя БД** — `onepayment_site_analyze`
- **Пользователь** и **пароль** — из панели

### Вариант A: SSL без проверки сертификата (проще)

Строка подключения в `.env`:

```
postgresql://<user>:<password>@<host>:5432/onepayment_site_analyze?sslmode=require
```

Подставь `<user>`, `<password>`, `<host>` из панели Selectel.

### Вариант B: SSL с verify-ca (как рекомендует Selectel)

1. Скачай CA-сертификат Selectel (в панели БД обычно есть ссылка или инструкция).
2. Сохрани его на сервере, например: `/var/www/sitechecker/certs/selectel-ca.pem`.
3. В `.env` добавь:

```
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/onepayment_site_analyze?sslmode=verify-ca
DATABASE_SSL_CA_PATH=/app/certs/selectel-ca.pem
```

В `docker-compose.yml` нужно смонтировать каталог с сертификатом (см. ниже).

Проверка подключения с сервера (для verify-ca нужен путь к CA):

```bash
# Установи клиент postgres, если ещё нет
sudo apt install -y postgresql-client

# Вариант с require (подставь host, user, пароль):
psql "host=<host> port=5432 dbname=onepayment_site_analyze user=<user> sslmode=require" -c "SELECT 1"

# Вариант verify-ca (нужен путь к CA — его даёт Selectel):
psql "host=<host> port=5432 dbname=onepayment_site_analyze user=<user> sslmode=verify-ca sslrootcert=/path/to/ca.pem" -c "SELECT 1"
```

---

## Часть 4: Файл .env на сервере

В каталоге проекта на сервере:

```bash
cd /var/www/sitechecker
cp .env.example .env
nano .env
```

Заполни `.env` по образцу (подставь свои значения):

```env
PORT=3000

# Selectel: подставь host, user, password из панели
DATABASE_URL=postgresql://USER:PASSWORD@master.52cdf1c0-dabf-4a66-90cb-1d30c24db178.c.dbaas.selcloud.ru:5432/onepayment_site_analyze?sslmode=require

# Для verify-ca раскомментируй и укажи путь к CA внутри контейнера (см. volumes в docker-compose):
# DATABASE_SSL_CA_PATH=/app/certs/selectel-ca.pem

BASE_URL=https://sitechecker.paymentgames.ru

# Telegram (по желанию)
# TELEGRAM_BOT_TOKEN=...
# TELEGRAM_CHAT_ID=...
```

Сохрани: `Ctrl+O`, Enter, `Ctrl+X`.

---

## Часть 5: Docker Compose и (опционально) CA для verify-ca

Если используешь **verify-ca** и положил сертификат в `./certs/selectel-ca.pem`, добавь в `docker-compose.yml` в секцию `services.app`:

```yaml
volumes:
  - screenshots:/app/server/storage/screenshots
  - ./certs:/app/certs:ro
```

Если используешь только `sslmode=require`, дополнительные volumes не нужны.

Сборка и запуск:

```bash
cd /var/www/sitechecker
docker compose up -d --build
```

Проверка:

```bash
docker compose ps
curl -s http://127.0.0.1:${PORT:-3000}/api/health
# Подставь свой порт из .env, если не 3000, например: curl -s http://127.0.0.1:8080/api/health
# Ожидается: {"ok":true}
```

---

## Часть 6: Nginx и домен sitechecker.paymentgames.ru

DNS: убедись, что **sitechecker.paymentgames.ru** указывает на **185.55.58.62** (A-запись).

На сервере создай конфиг Nginx:

```bash
sudo nano /etc/nginx/sites-available/sitechecker
```

Вставь (замени **3000** на значение `PORT` из твоего `.env`, если другое):

```nginx
server {
    listen 80;
    server_name sitechecker.paymentgames.ru;

    location / {
        proxy_pass http://127.0.0.1:3000;   # тот же порт, что и PORT в .env
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Включи сайт и перезагрузи Nginx:

```bash
sudo ln -sf /etc/nginx/sites-available/sitechecker /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Получи SSL-сертификат Let's Encrypt:

```bash
sudo certbot --nginx -d sitechecker.paymentgames.ru
```

Следуй подсказкам (email, согласие с условиями). После этого сайт будет доступен по **https://sitechecker.paymentgames.ru**.

В `.env` уже должен быть `BASE_URL=https://sitechecker.paymentgames.ru` (см. выше).

---

## Часть 7: Обновление деплоя в будущем

На сервере:

```bash
cd /var/www/sitechecker
git pull
docker compose up -d --build
```

При изменении `.env` или зависимостей после `git pull` снова выполни `docker compose up -d --build`.

---

## Краткий чеклист

| Шаг | Где | Действие |
|-----|-----|----------|
| 1 | Локально | `git push origin main` (или master) |
| 2 | Сервер | Установить Docker, Nginx, certbot |
| 3 | Сервер | Клонировать репозиторий в `/var/www/sitechecker` |
| 4 | Сервер | Создать `.env` с `DATABASE_URL` (Selectel), `BASE_URL` |
| 5 | Сервер | При verify-ca: положить CA в `certs/`, добавить volume в docker-compose |
| 6 | Сервер | `docker compose up -d --build` |
| 7 | Сервер | Nginx: конфиг для sitechecker.paymentgames.ru, `certbot --nginx` |
| 8 | Браузер | Открыть https://sitechecker.paymentgames.ru и проверить /api/health |

После этого приложение развёрнуто, история проверок и расписания работают через БД **onepayment_site_analyze** на Selectel.

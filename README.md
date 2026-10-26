# MEDIA / LOG — GitHub Cloud

Сайт: https://zbys1av.github.io/media-log/  
Репозиторій: https://github.com/zbys1av/media-log

## Що вже в репозиторії

- `index.html` — MEDIA / LOG v10.9, локальне збереження, JSON та Excel залишаються.
- `data.json` — канонічна хмарна колекція (435 записів; ігри вилучені згідно з попередньою домовленістю).
- `cloud-config.js` — публічний файл налаштувань; поки що OAuth і Worker URL не заповнені.
- `worker/src/index.js` — Cloudflare Worker, який **на сервері** перевіряє Google ID-токен, дозволяє запис **тільки** `zbyslav13@gmail.com` і оновлює `data.json` через GitHub API з перевіркою SHA.
- `worker/wrangler.toml` — конфігурація Worker.
- `.nojekyll`, `.gitignore` — службові файли.

## 1. Увімкнути GitHub Pages

GitHub → репозиторій → **Settings → Pages → Build and deployment → Deploy from a branch → main → /(root) → Save**.

Перевір сайт: https://zbys1av.github.io/media-log/ . До налаштування Worker він уже може читати `./data.json`.

## 2. Google Sign-In (без паролів у репозиторії)

1. Відкрий https://console.cloud.google.com/ і створи проєкт **MEDIA LOG**.
2. У **Google Auth Platform → Branding** задай ім'я, контактний email і решту потрібних полів.
3. У **Audience** вибери **External**. Якщо застосунок у **Testing**, додай `zbyslav13@gmail.com` як тестового користувача.
4. **Clients → Create client → Web application**.
5. У **Authorized JavaScript origins** додай **`https://zbys1av.github.io`** (без `/media-log/`).
6. Збережи **Client ID** (рядок `....apps.googleusercontent.com`). **Client Secret не потрібен для GIS popup-входу і не має бути в репозиторії.**

## 3. GitHub Fine-grained PAT

1. Відкрий https://github.com/settings/personal-access-tokens/new
2. Resource owner: `zbys1av`.
3. Repository access: **Only select repositories → media-log**.
4. Repository permissions: **Contents: Read and write**.
5. Згенеруй токен. **Не надсилай його в чат, не клади в код.** Він має бути тільки в секретах Cloudflare.

## 4. Cloudflare Worker

1. Зареєструйся або увійди на https://dash.cloudflare.com/ .
2. Встанови Node.js; клонуй репозиторій або завантаж його ZIP.
3. Відкрий `worker/wrangler.toml` та заміни `GOOGLE_CLIENT_ID` на Client ID з Google Cloud. `GITHUB_OWNER`, `GITHUB_REPO` та `ALLOWED_ORIGIN` уже заповнені.
4. В терміналі в папці `worker/`:
   ```sh
   npx wrangler login
   npx wrangler deploy
   npx wrangler secret put GITHUB_TOKEN
   ```
5. На останньому кроці встав fine-grained PAT тільки у запит секрету.
6. Запиши видану адресу, наприклад `https://media-log-sync.<your-subdomain>.workers.dev`.

Необов'язково після першої авторизації можна закріпити незмінний Google `sub` через секрет `GOOGLE_ALLOWED_SUB` (але **не** встановлюй його навмання).

## 5. Під'єднати сайт

Відкрий `cloud-config.js` у GitHub та заповни:

```js
window.MEDIA_LOG_CLOUD = {
  apiUrl: "https://media-log-sync.YOUR-SUBDOMAIN.workers.dev",
  googleClientId: "YOUR_CLIENT_ID.apps.googleusercontent.com",
  publicDataUrl: "./data.json"
};
```

Ці два значення публічні. Секрети сюди **не** вставляти.

Після коміту відкрий сайт → **Налаштування → Дані й резервні копії → GitHub Cloud**. Увійди Google-акаунтом `zbyslav13@gmail.com`; натисни «Зберегти в GitHub».

## Перевірка і безпека

- У приватному вікні без входу сайт повинен показати колекцію з `data.json`.
- Неавторизований акаунт не може виконувати PUT /data.
- Підтверджений Google ID-токен **лише** `zbyslav13@gmail.com` дозволяє запис.
- Конфлікт SHA повертає **409** замість тихого перезапису.
- Локальні копії, JSON-імпорт/експорт та Excel продовжують працювати.
- **Увага:** репозиторій публічний, отже `data.json` і всі його попередні коміти видимі стороннім. Google захищає право запису, а не читання.
- Якщо в тебе в браузері є новіші записи за цю хмарну копію, **експортуй свіжий JSON** перед синхронізацією і звір версії.

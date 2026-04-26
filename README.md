# ClickTrack Metronome

Web-приложение метронома для барабанщика на `React + TypeScript + Vite`.

## Команды

- `npm run dev` - запуск режима разработки
- `npm run build` - сборка проекта
- `npm run preview` - локальный просмотр production-сборки

## Auth (PocketBase)

Для входа/регистрации нужна переменная окружения:

- `VITE_POCKETBASE_URL`

Создайте `.env` по примеру `.env.example`.

### Коллекции PocketBase для групп

Для разделения данных по музыкальным группам используются коллекции:

- `bands` (минимум поле `name`, optional `owner` relation to users)
- `band_members` (`band` relation to bands, `user` relation to users, optional `role`, plus snapshot fields: `memberName`, `memberEmail`, `memberInstrument`, `memberAvatar`, `memberAvatarUrl`)
- `band_data` (`band` relation to bands, `payload` JSON)
- `band_invites` (`band` relation to bands, `token` text, `isActive` bool, `expiresAt` date, optional `invitedBy` relation to users)

Также в `users` используется поле `instrument` (text) для профиля.

В `payload` хранится объект:

```json
{
  "tracks": [],
  "setlists": [],
  "nextTrackId": 1,
  "nextSetlistId": 1
}
```

Роуты:

- `/` - публичная главная
- `/login` - вход
- `/register` - регистрация
- `/invite/:token` - вход по ссылке-приглашению в группу
- `/app` - приватная часть (метроном)

Инвайты создаются на 24 часа по умолчанию. Истекшие или деактивированные ссылки не принимаются.

## Структура сборки

Проект настроен на работу с папкой `public_html`:

- статические файлы берутся из `public_html`
- результат `npm run build` также пишется в `public_html`

Это сделано для совместимости с OpenServer, где `public_html` можно использовать как web-root.

# DocOS v4.8.0

Личен PWA архив за документи, термини и напомняния.

**Live:** https://docs.svd-clean.de

## Технологии
- Vanilla HTML / CSS / JavaScript (без билд)
- Service Worker (offline-first cache)
- IndexedDB (idb)
- PWA: installable, fullscreen, иконки 192/512
- Защита: 4-цифрен PIN

## Структура
```
index.html       UI shell
app.js           Цяла логика (~300KB)
styles.css       Стилове (~130KB)
sw.js            Service Worker — cache shell + runtime libs
manifest.json    PWA manifest
icons/           PWA иконки (192, 512, maskable, apple-touch)
vercel.json      Security headers + cache rules
```

## Deploy
Auto-deploy на Vercel при push към `main`.

## След промяна на shell файлове
Bump-ни кеш версиите в `sw.js`:
```js
const DOCOS_SHELL_CACHE = 'docos-shell-v15'; // +1
const DOCOS_RUNTIME_CACHE = 'docos-runtime-v8'; // +1 ако има промяна в RUNTIME_URLS
```

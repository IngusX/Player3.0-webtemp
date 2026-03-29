# Changelog

## Resumen

Este documento resume los cambios realizados en:

- `laion2` → versión principal / estable
- `laion2-apk` → wrapper Android con Capacitor
- `kscast 1.0` → mirror experimental para integración Cast

---

## Línea principal: `laion2`

### Cambios de estructura

- Reorganización del proyecto en carpetas:
  - `css/`
  - `js/`
  - `docs/`
  - `assets/img/`
- Actualización de rutas en `index.html` y `player2.0.html`.
- Documentación técnica movida a `docs/README-player.md`.

### Refactor técnico del player

- Modularización del antiguo `player.js` en:
  - `js/player-core.js`
  - `js/player-device.js`
  - `js/player-height.js`
  - `js/player-ui.js`
  - `js/player-audio.js`
  - `js/player.js` (bootstrap)
- Centralización de la detección de dispositivo/capacidades.
- Mejora de accesibilidad con labels dinámicos y portada contextual.

### Layout / UI host

- Ajuste del `iframe` para que el `min-height` fijo solo aplique en mobile.
- Eliminación del exceso de altura en desktop.
- Layout desktop reequilibrado entre player y Discord.
- Integración visual host + embed:
  - fondo transparente en embed
  - menos chrome visual del iframe
  - ajuste de márgenes/padding en modo embebido
- Sincronización visual entre altura del player y bloque Discord.
- Límite de ancho del player en tablet.
- Footer temporal agregado en la landing.
- Footer evolucionado a banner estilo anime.

### Hardening y testing

- Restricción de `postMessage` por `origin` entre host y embed.
- Agregado de smoke tests con Playwright:
  - render básico
  - sincronización de altura
  - límite de ancho en tablet

### Integración Media Session web

- Agregado soporte de `Media Session API` para:
  - metadata
  - artwork
  - playback state
  - acciones `play/pause/stop`

---

## Wrapper Android: `laion2-apk`

### Bootstrap APK debug

- Creación de proyecto separado con Capacitor en:
  - `/Users/ingus/Documents/laion2-apk`
- Scripts para sincronizar contenido web hacia `www/`.
- Plataforma Android agregada.
- Build debug funcional.

### Branding / icono

- Reemplazo del icono Android con imagen personalizada.
- Generación de APK renombrado como `ks-demo.apk`.

### Reproducción nativa Android

- Migración del playback del APK desde `<audio>` web a **ExoPlayer nativo**.
- Implementación de:
  - `MediaNotificationService`
  - `MediaControlsPlugin`
  - `MediaSession`
  - notificación multimedia nativa
- Bridge entre WebView/iframe y capa nativa Android.

### Fixes principales en APK

- Fix de bridge iframe ↔ Capacitor.
- Fix de crash por acceso a ExoPlayer desde hilo incorrecto.
- Versionado de builds debug.

### Versiones relevantes del wrapper APK

- `1.01`
  - corrección de crash `Player is accessed on the wrong thread`
- builds intermedios con ajustes nativos de reproducción y notificación

---

## Mirror experimental: `kscast 1.0`

### Objetivo

Mirror creado para experimentar Cast sin romper la versión estable.

Rutas:

- `/Users/ingus/Documents/kscast 1.0/laion2`
- `/Users/ingus/Documents/kscast 1.0/laion2-apk`

### Integración Google Cast

- Agregado soporte inicial de Google Cast SDK en Android.
- Botón Cast visible en la UI web del player.
- Bridge web ↔ nativo para:
  - consultar estado Cast
  - abrir selector de dispositivos
  - desconectar sesión
  - controlar reproducción remota
- Envío del stream live al **Default Media Receiver**.

### UX Cast / estado

- Mejora de estados de conexión.
- Reintentos de carga remota para evitar falsos errores visuales.
- Corrección del estado del botón cuando se cierra el selector sin elegir dispositivo.
- Corrección para que Play/Pause interno controle la sesión Cast activa.
- Reset correcto del botón Play/Pause al desconectar Cast.
- Ocultamiento completo del control de volumen en la app KS Cast.

### Branding del mirror Cast

- Nombre visible de la app cambiado a **KS Cast**.

---

## Versionado de KS Cast

### `1.10`

- Primera versión nombrada como KS Cast.
- Integración inicial de Cast.

### `1.11`

- Corrección del crash por llamadas de Cast fuera del main thread.
- Botón Play/Pause interno conectado a la sesión Cast remota.

### `1.12`

- Mejora de la UX de conexión Cast.
- Reintentos para evitar falso error transitorio al conectar.

### `1.13`

- Limpieza del estado pendiente cuando el selector Cast se cierra sin elegir dispositivo.
- Corrección del `versionName` interno para que coincida con el nombre del build.

### `1.14`

- Ocultamiento completo del control de volumen en KS Cast.
- Corrección del botón Play/Pause tras desconectar Cast.

APK actual generado:

- `/Users/ingus/Documents/kscast 1.0/laion2-apk/android/app/build/outputs/apk/debug/ks-cast-v1.14.apk`

---

## Estado actual

### Estable

- `laion2` sigue siendo la base estable web.
- `laion2-apk` conserva la línea de wrapper Android principal.

### Experimental

- `kscast 1.0` contiene toda la línea de pruebas e integración con Google Cast.

---

## Próximos pasos sugeridos

- seguir puliendo la UX de conexión/desconexión Cast
- validar comportamiento con distintos Chromecast / Google Home
- decidir si se mantiene `Default Media Receiver` o si en el futuro se migra a `Custom Receiver`

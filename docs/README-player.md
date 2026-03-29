# Documentación técnica del player

## 1. Objetivo del proyecto

Este proyecto implementa una landing estática para **Konata Station** con tres responsabilidades principales:

1. mostrar el reproductor de radio,
2. integrar el widget de Discord,
3. presentar una página host simple que pueda embebir el player sin duplicar lógica.

La solución está construida con **HTML + CSS + JavaScript vanilla**, sin bundler ni framework.

---

## 2. Arquitectura general

La arquitectura sigue un patrón **host + embed**.

### Host

La página host es `index.html`.

Sus responsabilidades son:

- renderizar la landing principal,
- incrustar `player2.0.html` dentro de un `iframe`,
- mostrar Discord en la misma página,
- sincronizar la altura del `iframe`,
- aplicar el layout externo por breakpoint,
- mostrar el footer/banner temporal del sitio.

### Embed

El reproductor real vive dentro de `player2.0.html`.

Sus responsabilidades son:

- renderizar la UI del player,
- controlar el elemento `<audio>`,
- consultar metadata del stream,
- renderizar historial y estado en vivo,
- persistir preferencias locales,
- reportar altura al host cuando cambia el contenido.

---

## 3. Mapa de archivos

### `index.html`

Página host.

- renderiza logo, player, Discord y footer,
- contiene la lógica host-side del auto-resize del `iframe`,
- define reglas JS para altura mínima según breakpoint.

### `index.css`

CSS de la landing host.

- controla centrado general,
- define proporción player/Discord en desktop,
- limita el ancho del player en tablet,
- elimina chrome visual innecesario alrededor del `iframe`,
- estiliza el footer/banner temporal.

### `player2.0.html`

Markup del reproductor.

- card principal,
- portada,
- badge de estado,
- título/artista,
- botón play,
- mute y volumen,
- historial mobile y desktop,
- `<audio>` real.

### `player.css`

CSS interno del reproductor.

- layout visual del player,
- responsive interno,
- tema claro/oscuro,
- tratamiento especial para modo embebido,
- estilos de historial, controles y accesibilidad.

### `player-embed.css`

Reset mínimo del embed.

- quita márgenes de `html` y `body`,
- deja fondo transparente para integrarse mejor con la página host.

### `player-core.js`

Base compartida del player.

- constantes,
- referencias DOM,
- estado global,
- acceso seguro a `localStorage`,
- utilidades comunes.

### `player-device.js`

Detección de capacidades del dispositivo.

- centraliza heurísticas de touch/pointer/hover,
- evita repartir detección de plataforma por todo el código,
- decide si se debe ocultar la UI de volumen.

### `player-height.js`

Comunicación de altura embed ↔ host.

- `postMessage`,
- observers,
- fallbacks,
- re-medición del documento,
- validación de `origin` entre host y embed.

### `player-native.js`

Puente opcional hacia el contenedor Android del APK.

- detecta el plugin nativo `MediaControls`,
- sincroniza título, artista, artwork y estado play/pause,
- permite cerrar la notificación nativa cuando corresponde.

### `player-ui.js`

Lógica visual del reproductor.

- tema,
- volumen y mute,
- título/artista,
- historial,
- badge,
- estados expandibles,
- integración con Media Session API.

### `player-audio.js`

Lógica funcional de audio y metadata.

- reproducción,
- recuperación,
- polling,
- watchdog,
- render basado en metadata,
- respuesta a controles play/pause disparados desde Media Session.

### `player.js`

Bootstrap mínimo.

- coordina inicialización de módulos,
- ejecuta montaje del player,
- libera recursos en `beforeunload`.

### `playwright.config.js`

Configuración de smoke tests.

- define `testDir`,
- configura `baseURL`,
- levanta un server estático con `python3 -m http.server 5501`,
- reutiliza servidor existente si ya está levantado.

### `tests/player-smoke.spec.js`

Smoke tests de la landing.

- valida render básico,
- verifica sincronización de altura player/Discord en desktop,
- verifica límite de ancho del player en tablet.

---

## 4. Flujo completo de render

## 4.1 Host

1. `index.html` carga la estructura principal.
2. Inserta el `iframe` con `src="player2.0.html"`.
3. Inserta el bloque de Discord.
4. Inserta el footer temporal al final de la página.
5. Al cargar el `iframe`, el host solicita la altura real con `postMessage`.
6. El host ajusta la altura del `iframe` según:
   - mobile: piso visual de `745px`,
   - tablet: altura dinámica,
   - desktop: altura compartida visual con Discord.

## 4.2 Embed

1. `player2.0.html` carga el markup completo del player.
2. Se cargan en orden los módulos `player-core.js`, `player-device.js`, `player-height.js`, `player-ui.js`, `player-audio.js` y finalmente `player.js` como bootstrap.
3. Se resuelven:
   - tema inicial,
   - volumen y mute persistidos,
   - visibilidad o no de la UI de volumen,
   - fuente del stream,
   - primera consulta de metadata.
4. El player reporta su altura al host.
5. Cada cambio relevante de contenido vuelve a reportar altura.

---

## 5. Funcionamiento técnico del player

Esta es la parte más importante del sistema.

## 5.1 Configuración base

En `player-core.js` se definen constantes clave:

- `ENDPOINT`: API de metadata
- `STREAM_URL`: URL del stream MP3
- claves de `localStorage`
- intervalos de polling
- timeout del watchdog de congelamiento

### Endpoint actual

- Metadata: `https://stream.host-cx.net.ar/api/nowplaying/3`
- Audio: `https://stream.host-cx.net.ar/listen/konata-station-radio/radio.mp3`

---

## 5.2 Inicialización

Cuando ocurre `DOMContentLoaded`, el player hace esto en orden:

1. `player-device.js` detecta capacidades reales del dispositivo y decide la política de volumen,
2. `player-ui.js` resuelve el tema inicial,
3. `player-ui.js` restaura volumen y mute desde `localStorage`,
4. `player-audio.js` configura `player.src`,
5. `player-audio.js` fuerza `preload = 'auto'` en Apple/Android táctil cuando corresponde,
6. `player-audio.js` ejecuta `fetchAndRender()`,
7. `player-height.js` instala observers para reportar altura al host.

---

## 5.3 Reproducción de audio

La reproducción se gestiona sobre el elemento:

```html
<audio id="player" playsinline type="audio/mpeg" preload="none"></audio>
```

### Función `goLive(forceLive = false)`

Es la función central para enganchar el stream en vivo.

Responsabilidades:

- preservar mute previo,
- preservar volumen previo,
- recrear `src` con cache-busting cuando hace falta,
- forzar recarga del stream si se pide `forceLive`,
- ejecutar `player.play()`,
- actualizar el icono play/pause.

### Cache busting

Se usa:

```js
${STREAM_URL}?_=${Date.now()}
```

Esto evita engancharse a una versión vieja del stream por caché.

### Lógica del botón Play

Cuando el usuario toca Play:

- si estaba pausado, intenta reanudar o reenganchar al vivo,
- si la pausa fue larga (`>= 60s`), fuerza recarga del stream,
- si estaba reproduciendo, pausa el audio y actualiza el icono.

### Soporte táctil

Existe un listener adicional en `touchstart` para reducir fricción en móviles.

### Media Session API

Si el navegador/WebView soporta `navigator.mediaSession`, el player:

- publica metadata de la pista actual,
- publica artwork para la notificación/lock screen,
- sincroniza `playbackState`,
- registra handlers para `play`, `pause` y `stop`.

Esto mejora la integración con controles multimedia del sistema, aunque el resultado final sigue dependiendo del soporte real del WebView/Android.

### Integración nativa en el APK

Cuando el player corre dentro del wrapper Capacitor, `player-native.js` intenta hablar con un plugin nativo Android.

Ese puente manda al contenedor:

- título,
- artista,
- artwork,
- estado de reproducción.

Con eso, el APK puede mostrar una notificación multimedia propia con acciones `play`, `pause` y `cerrar`, más cercana a una app nativa que a un WebView puro.

---

## 5.4 Recuperación del stream

El player no depende solo de `play()`; implementa varias capas de recuperación.

### `recover()`

Intenta reconectar si el audio está degradado.

Protecciones incluidas:

- no ejecuta si ya está pausado,
- no ejecuta si ya hay recuperación en curso,
- throttle temporal para evitar reconexiones agresivas.

### Eventos observados

Se reacciona a:

- `error`
- `emptied`
- `waiting`
- `stalled`
- `seeking`

### Refresh periódico al vivo

`scheduleLiveRefresh()` fuerza un refresh cada hora mientras el stream está reproduciendo, para reducir drift o sesiones viejas.

### Stall watchdog

`armStallWatchdog()` observa:

- tiempo desde el último `timeupdate`,
- avance real de `currentTime`,
- `readyState`.

Si detecta congelamiento silencioso, dispara `recover()`.

### Cambio de visibilidad

Cuando la pestaña vuelve a ser visible:

- se relanza el polling,
- se intenta recuperar el stream si estaba sonando,
- se rearma el refresh y el watchdog.

---

## 5.5 Metadata y render UI

### `fetchAndRender()`

Es la función principal de actualización visual.

Hace lo siguiente:

1. aborta request previa si el navegador soporta `AbortController`,
2. ejecuta `fetch` con `cache: 'no-store'`,
3. valida `response.ok`,
4. parsea JSON,
5. actualiza track actual,
6. actualiza badge de fuente,
7. actualiza historial,
8. solicita nuevo reporte de altura,
9. agenda la próxima ejecución.

### Polling

El polling es adaptativo:

- visible: `10s`
- pestaña oculta: `30s`

### Render incremental

Para evitar rerender innecesario se usan firmas:

- track actual: `title|artist|art`
- historial: serialización parcial de entradas

Si la firma no cambia, no se vuelve a renderizar.

### Badge de estado

`updateSourceBadge()` cambia entre:

- `AUTO DJ`
- nombre del streamer en vivo

según `data.live.is_live`.

### Historial

`updateHistory()` renderiza:

- 3 canciones en mobile,
- 5 canciones en desktop.

Se construye usando DOM API (`createElement`, `textContent`) para evitar HTML crudo.

### Manejo de error

Si falla metadata:

- se registra el error en consola,
- se muestra `ERROR AL CARGAR` en los listados,
- se reintenta vía siguiente ciclo de polling.

---

## 5.6 Volumen, mute y preferencias

### Detección de dispositivos

La detección quedó encapsulada en `player-device.js`.

La estrategia ya no depende de una sola señal, sino de una combinación centralizada de:

- `userAgent` para hints de plataforma,
- `navigator.platform`,
- `maxTouchPoints`,
- `pointer: fine/coarse`,
- `hover` y `any-hover`,
- capacidad táctil real del entorno.

Con eso se construye un perfil de dispositivo con campos como:

- `isAppleTouch`,
- `isAndroidTouch`,
- `touchCapable`,
- `likelyDesktop`,
- `shouldHideVolumeUi`.

### Regla práctica

Si el dispositivo tiene UI de volumen poco fiable, se oculta el slider y se muestra un hint para usar los botones físicos.

### Persistencia local

Se usan estas claves:

- `ks_volume_v2`
- `ks_muted_v2`
- `ks_theme`
- `ks_artist_expanded`

### Funciones relevantes

- `restoreVolume()`
- `persistVolume()`
- `persistMute()`
- `toggleMute()`
- `applyTheme()`

---

## 5.7 Tema y UI expandible

### Tema

El tema se resuelve así:

1. si existe valor guardado, se usa,
2. si no, se usa `prefers-color-scheme`.

Al cambiar tema:

- se actualizan atributos `data-theme`,
- se actualiza icono,
- se persiste en `localStorage`,
- se reporta altura por si cambia el layout.

### Artista expandible

El nombre del artista puede colapsarse o expandirse.

Esto se maneja con:

- `setArtist()`
- `applyArtistView()`
- `toggleArtist()`

También se persiste su estado expandido.

### Chips expandibles

Las canciones del historial se renderizan como botones expandibles.

Esto permite:

- mostrar texto truncado por defecto,
- expandir al click,
- recalcular altura del embed cuando cambia el alto real.

---

## 5.8 Comunicación embed ↔ host

Esta parte mantiene el player integrado dentro del `iframe`.

### Del embed al host

El hijo envía:

```js
window.parent.postMessage({
  sender: 'ksplayer',
  type: 'ksplayer:height',
  height
}, parentOrigin)
```

### Del host al embed

El padre puede pedir re-medición con:

```js
postMessage({ type: 'ksplayer:request-height' }, playerOrigin)
```

### Validación de origen

Ahora host y embed validan `event.origin` antes de procesar mensajes.

Esto reduce el riesgo de aceptar mensajes de ventanas ajenas cuando el player está embebido.

### Cuándo se recalcula altura

- al cargar,
- al cambiar historial,
- al expandir artista,
- al cambiar tema,
- al hacer resize,
- al mutar el DOM en fallback,
- cuando actúan los observers.

### Fallbacks

Si no hay `ResizeObserver`, se usa:

- `MutationObserver`,
- ráfaga de timeouts `[120, 360, 900]`.

---

## 6. Responsive real del proyecto

Hay dos responsives distintos:

1. el **responsive del host**,
2. el **responsive interno del player**.

## 6.1 Responsive del host (`index.css`)

### Mobile (`<= 599px`)

- player primero,
- Discord debajo,
- `iframe` con piso visual de `745px`,
- footer al final.

### Tablet (`600px - 899px`)

- player centrado,
- `iframe` con `max-width: 400px`,
- altura dinámica real,
- Discord debajo.

### Desktop (`>= 900px`)

- layout en dos columnas,
- proporción aproximada `40 / 60` entre player y Discord,
- altura visual sincronizada entre ambos bloques,
- footer debajo del contenido principal.

## 6.2 Responsive interno del player (`player.css`)

- `< 360px`: versión más compacta,
- `< 479px`: la fila de volumen puede envolver,
- `>= 920px`: aparece panel lateral desktop interno,
- `max-height: 680px`: modo compacto vertical.

---

## 7. Accesibilidad

Aspectos positivos:

- `lang="es"` en ambos HTML,
- `aria-label` en controles clave,
- `aria-live="polite"` para contenido dinámico,
- `aria-expanded` en artista y chips,
- `aria-pressed` en tema y mute,
- `focus-visible` en host y embed,
- uso de botones reales para acciones interactivas.

Aspectos mejorables:

- `postMessage('*')` sigue siendo funcional pero no estricto,
- no hay validación formal del origen esperado,
- faltan tests automáticos de accesibilidad y flujos críticos.

---

## 8. Riesgos técnicos actuales

1. La medición fallback del host depende de que el `iframe` siga siendo same-origin.
2. Solo hay smoke tests básicos; todavía faltan pruebas más profundas de polling, recuperación y edge cases.
3. La detección mejoró al centralizarse en un helper de capacidades, pero sigue siendo heurística y no puede eliminar todos los edge cases en navegadores híbridos.
4. Media Session API mejora integración con notificaciones/lock screen, pero su comportamiento no es uniforme en todos los WebView de Android.

---

## 9. Recomendaciones de evolución

## 9.1 Refactor técnico

El player ya quedó separado en módulos por responsabilidad:

- `player-core.js`
- `player-device.js`
- `player-height.js`
- `player-ui.js`
- `player-audio.js`
- `player.js` como bootstrap

Las siguientes mejoras de refactor razonables serían:

- extraer tests de helpers puros,
- desacoplar aún más audio de render,
- aislar serialización de metadata y firmas en un módulo propio.

## 9.2 Hardening

- restringir `postMessage` por `origin`,
- documentar contrato del endpoint `nowplaying`,
- mejorar estados visuales de error/carga,
- ampliar los smoke tests de Playwright con casos de reproducción, metadata y resize extremo.

## 9.3 Producto

- agregar observabilidad mínima si se publica en producción real.

---

## 10. Resumen ejecutivo

El sistema actual funciona bien como un reproductor embebido con host estático:

- el **host** controla composición, integración visual, altura y layout externo,
- el **embed** controla audio, metadata, historial, tema y accesibilidad,
- el player implementa polling inteligente, render incremental y recuperación del stream,
- la solución ya está optimizada para integración embebida, aunque sigue necesitando modularización y hardening para producción formal.

# README técnico del player

## Propósito de este documento

Este archivo documenta **solo la parte técnica del reproductor**. Complementa al `README.md` principal y se enfoca en:

- flujo interno del player,
- responsabilidades de módulos JS/CSS,
- contratos de integración embed,
- bridge nativo,
- variantes del player y puntos sensibles de mantenimiento.

> Para visión general del repositorio, arranque local y mapa global de archivos, usa primero `../README.md`.

## 1. Alcance del player dentro del proyecto

El player forma parte de una arquitectura **host + embed**:

| Pieza | Archivo | Función |
|---|---|---|
| Host | `index.html` | Inserta el `iframe`, sincroniza altura, integra Discord y sirve de intermediario con `MediaControls` cuando existe contenedor nativo. |
| Embed principal | `player2.0.html` | Implementa la experiencia completa del reproductor. |
| Embed compacto | `player2.0stream.html` | Reutiliza la lógica base del player con UI reducida y estrategia de autoplay más agresiva. |

Este documento se concentra en las dos variantes embed y en su relación con el host.

## 2. Variantes del player

| Archivo | Cuándo usarlo | Características |
|---|---|---|
| `player2.0.html` | Reproductor principal | UI completa, controles visibles, historial mobile/desktop, selector de tema, mute y volumen. |
| `player2.0stream.html` | Widget visual / card compacta | Fuerza dark mode, oculta casi toda la UI, fija volumen alto, intenta autoplay y mantiene el stack base de JS. |

### Diferencia clave

`player2.0stream.html` **NO es otro player distinto**: es una variante visual/comportamental que sigue apoyándose en la misma base modular (`player-core`, `player-ui`, `player-audio`, etc.).

## 3. Contrato de carga del embed

Tanto `player2.0.html` como `player2.0stream.html` cargan sus scripts en este orden:

1. `player-core.js`
2. `player-device.js`
3. `player-height.js`
4. `player-native.js`
5. `player-ui.js`
6. `player-audio.js`
7. `player.js`

### Por qué importa este orden

Los módulos comparten el namespace global `window.KSPlayer`. Si se altera el orden, los módulos posteriores pueden intentar consumir configuración, referencias DOM o helpers que todavía no existen.

## 4. Módulos JavaScript del player

| Módulo | Responsabilidad | Por qué existe |
|---|---|---|
| `js/player-core.js` | Configuración base, estado compartido, refs DOM, `localStorage` seguro y helpers. | Evita duplicar constantes, contratos y utilidades entre módulos. |
| `js/player-device.js` | Detección de capacidades reales del dispositivo. | Centraliza heurísticas de touch, pointer, hover y desktop/mobile. |
| `js/player-height.js` | Comunicación de altura con el host. | Mantiene el `iframe` alineado con la altura real del contenido. |
| `js/player-native.js` | Bridge hacia `MediaControls` o fallback vía host. | Permite integrar el player web con un contenedor Capacitor/Android. |
| `js/player-ui.js` | Tema, mute, volumen, render del track, historial y Media Session API. | Separa la lógica visual e interactiva del playback puro. |
| `js/player-audio.js` | Playback, metadata, polling, refresh y recuperación del stream. | Es el núcleo funcional del player. |
| `js/player.js` | Bootstrap y cleanup. | Ordena la inicialización y el cierre del player. |

## 5. Módulos CSS del player

| Archivo | Qué resuelve |
|---|---|
| `css/player-embed.css` | Reset mínimo del documento embebido: quita márgenes y deja fondo transparente. |
| `css/player.css` | Layout principal, responsive, controles, historial, estados visuales y temas del player principal. |
| CSS inline en `player2.0stream.html` | Estilo específico de la variante compacta oscura. |

## 6. Flujo interno del player

### 6.1 Inicialización

Cuando carga el embed:

1. `player-core.js` deja listas config, refs y estado compartido.
2. `player-device.js` evalúa capacidades del entorno y decide si la UI de volumen debe mostrarse.
3. `player-ui.js` restaura tema, mute, volumen y estados visuales persistidos.
4. `player-audio.js` configura el elemento `<audio>` y lanza la primera consulta de metadata.
5. `player-height.js` instala observers y reporta altura al host.
6. `player.js` coordina el bootstrap general y cleanup en `beforeunload`.

#### Diagrama de inicialización

```text
HTML embed
  -> player-core.js prepara config, DOM y estado
  -> player-device.js evalúa capacidades del entorno
  -> player-ui.js restaura tema/volumen/mute/UI
  -> player-audio.js conecta audio + metadata
  -> player-height.js instala resize/reportes
  -> player.js termina bootstrap y cleanup
```

### 6.2 Metadata

La metadata sale del endpoint:

```text
https://stream.host-cx.net.ar/api/nowplaying/3
```

`fetchAndRender()` se encarga de:

1. abortar requests previas cuando el navegador lo soporta,
2. hacer `fetch` con `cache: 'no-store'`,
3. parsear la respuesta,
4. actualizar track actual, artista, portada, badge e historial,
5. pedir recálculo de altura,
6. agendar el siguiente polling.

### 6.3 Polling

| Estado de la pestaña | Frecuencia |
|---|---|
| Visible | cada `10s` |
| Oculta | cada `30s` |

Además, cuando la pestaña vuelve a estar visible, el player intenta reenganchar estado, relanza polling y rearma mecanismos de recuperación.

#### Diagrama de polling y metadata

```text
fetchAndRender()
  -> fetch nowplaying (cache: no-store)
  -> parsea JSON
  -> actualiza track / artista / portada / historial
  -> pide recálculo de altura
  -> agenda próximo poll
        visible: 10s
        oculta: 30s
```

### 6.4 Reproducción del stream

La URL base del stream es:

```text
https://stream.host-cx.net.ar/listen/konata-station-radio/radio.mp3
```

La función central de reproducción es `goLive(forceLive = false)` y se encarga de:

- preservar mute/volumen cuando corresponde,
- reconstruir `src` con cache-busting,
- forzar recarga del stream si hace falta,
- invocar `play()`,
- sincronizar estado visual de la UI.

#### Diagrama de audio y recuperación

```text
Usuario / MediaSession / variante stream
  -> goLive()
      -> prepara src del MP3
      -> play()
      -> actualiza botón/UI
  -> si hay waiting/stalled/error/emptied
      -> recover()
      -> reintento controlado
      -> watchdog + live refresh
```

### 6.5 Recuperación

El player NO depende solo de un `play()` inicial. Tiene varias capas de resiliencia:

- `recover()` para reconectar cuando el audio se degrada,
- listeners sobre `error`, `emptied`, `waiting`, `stalled` y `seeking`,
- refresh periódico del stream en sesiones largas,
- stall watchdog para detectar congelamientos silenciosos.

ESTO ES CLAVE: si alguien toca `player-audio.js` sin entender este flujo, rompe el corazón del sistema.

## 7. Persistencia local y estado UI

### Claves de `localStorage`

| Clave | Uso |
|---|---|
| `ks_volume_v2` | Persistencia de volumen |
| `ks_muted_v2` | Persistencia de mute |
| `ks_theme` | Tema claro/oscuro |
| `ks_artist_expanded` | Estado expandido del artista |

### Comportamientos persistidos

- volumen,
- mute,
- tema,
- expansión del artista.

En `player2.0stream.html` algunas de estas preferencias se fuerzan para priorizar la experiencia compacta oscura.

## 8. Responsive del player

### Responsive del host

Aunque el host se documenta en el README principal, afecta al embed porque define el espacio que recibe el `iframe`:

| Breakpoint | Comportamiento del host |
|---|---|
| `<= 599px` | Player arriba, Discord debajo, altura mínima visual del `iframe`. |
| `600px - 899px` | Player centrado con ancho acotado. |
| `>= 900px` | Layout en dos columnas con sincronización visual entre player y Discord. |

### Responsive interno del embed

`css/player.css` adapta el player según ancho y alto disponible:

- modo base vertical en mobile,
- compactación extra en pantallas muy angostas,
- panel lateral de historial en desktop,
- ajustes especiales cuando la altura es reducida.

## 9. Integración embed ↔ host

### Del embed al host

El player reporta altura al padre mediante `postMessage` con eventos del tipo:

```js
{
  sender: 'ksplayer',
  type: 'ksplayer:height',
  height
}
```

### Del host al embed

El host puede pedir re-medición con:

```js
{ type: 'ksplayer:request-height' }
```

#### Diagrama de `postMessage` y altura

```text
Embed
  -> calcula altura real del documento
  -> postMessage { sender: 'ksplayer', type: 'ksplayer:height', height }
Host (index.html)
  -> valida event.source + event.origin
  -> ajusta altura del iframe
  -> puede reenviar { type: 'ksplayer:request-height' }
Fallback
  -> ResizeObserver
  -> MutationObserver
  -> medición directa del iframe desde el host
```

### Seguridad actual

Tanto host como embed validan `event.origin` antes de procesar mensajes. Eso es importante porque baja el riesgo de aceptar mensajes ajenos cuando el player vive embebido.

### Fallbacks de altura

Si no hay `ResizeObserver`, el sistema cae en combinaciones de:

- `MutationObserver`,
- timeouts en ráfaga,
- medición directa del documento embebido desde el host cuando el contexto lo permite.

## 10. Integración nativa

`js/player-native.js` permite que el player web hable con un contenedor Capacitor/Android cuando existe:

```js
window.Capacitor?.Plugins?.MediaControls
```

### Qué sincroniza

- play,
- pause,
- stop,
- metadata,
- artwork,
- estado de reproducción.

### Dos caminos posibles

| Camino | Cuándo ocurre |
|---|---|
| Acceso directo al plugin | Cuando el embed tiene acceso al runtime Capacitor. |
| Fallback vía host | Cuando el embed necesita pedir al host que invoque la acción nativa. |

Esto explica por qué `index.html` también contiene lógica de bridge y NO es solo una landing visual.

## 11. Integración y contratos de accesibilidad

Aspectos ya presentes:

- `lang="es"` en los HTML,
- `aria-live` en contenido dinámico,
- `aria-expanded` en artista e historial expandible,
- `aria-pressed` en tema y mute,
- uso de botones reales para acciones interactivas.

Aspectos pendientes o mejorables:

- ampliar cobertura automatizada de accesibilidad,
- revisar experiencia de autoplay y feedback en bloqueos del navegador,
- endurecer aún más escenarios extremos de integración embed en terceros.

## 12. Dependencias externas del player

| Dependencia | Uso |
|---|---|
| `stream.host-cx.net.ar` | Metadata y stream de audio |
| Google Fonts / Material Icons | Tipografía e iconografía |
| Imágenes remotas | Cover por defecto y branding |
| `ks-player-assets` vía jsDelivr | CSS de marca usado por el host |

Si estas dependencias fallan, la UI puede verse correcta localmente pero degradarse funcionalmente en producción.

## 13. Zonas sensibles de mantenimiento

| Área | Archivo de entrada | Riesgo |
|---|---|---|
| Playback y recuperación | `js/player-audio.js` | Romper reconexión, autoplay, watchdog o refresh del vivo. |
| Contrato global | `js/player-core.js` | Desalinear nombres/refs/config que usan todos los módulos. |
| Resize del embed | `js/player-height.js` + `index.html` | Cortes visuales, scroll interno o desajuste con Discord. |
| Bridge nativo | `js/player-native.js` + `index.html` | Desincronización con `MediaControls` o fallos solo visibles en APK/WebView. |
| Variante compacta | `player2.0stream.html` | Generar expectativas falsas de autoplay o romper el forcing de estado visual. |

## 14. Riesgos técnicos actuales

1. El autoplay sigue dependiendo de políticas del navegador o WebView; ningún hack del lado frontend puede garantizarlo.
2. Parte del fallback de medición sigue siendo más fiable cuando host y embed operan en contexto compatible.
3. La detección de dispositivos está mejor encapsulada, pero continúa siendo heurística.
4. Los smoke tests existentes validan estructura y layout, no cubren a fondo playback, metadata ni integración nativa.

## 15. Troubleshooting del player

### Autoplay bloqueado

| Síntoma | Causa probable | Qué revisar |
|---|---|---|
| El player carga pero no suena hasta tocar la pantalla | Política de autoplay del navegador/WebView bloquea `play()` sin interacción | Confirmar si el primer `play()` cae en `catch`; probar con gesto real del usuario; recordar que `player2.0stream.html` solo aumenta intentos de unlock, no garantiza éxito. |

Notas útiles:

- `player2.0stream.html` fuerza `autoplay`, `preload="auto"`, volumen `100` y varios eventos (`load`, `pageshow`, `focus`, `pointerdown`, `touchstart`, `click`, `keydown`) para intentar destrabar audio.
- `player2.0.html` mantiene un comportamiento más conservador y depende más del gesto explícito del usuario.

### El `iframe` no ajusta altura

| Síntoma | Causa probable | Qué revisar |
|---|---|---|
| Queda espacio vacío o aparece scroll interno | El host no recibe `ksplayer:height`, o el `origin` esperado no coincide | Verificar `PLAYER_ORIGIN` en `index.html`, `document.referrer` / `parentOrigin` en `js/player-height.js`, y que el host pueda recibir `postMessage` del embed real. |
| Ajusta tarde o de forma inestable | El navegador cayó a fallback sin `ResizeObserver` | Revisar si está actuando `MutationObserver` + burst de timeouts; considerar que el ajuste será menos fino. |

### Metadatos o portada no actualizan

| Síntoma | Causa probable | Qué revisar |
|---|---|---|
| El track quedó viejo o la portada no cambia | Falló `fetchAndRender()`, el endpoint devolvió error o la pestaña estuvo oculta mucho tiempo | Validar `https://stream.host-cx.net.ar/api/nowplaying/3`, revisar errores `HTTP` o `fetch` en consola, y confirmar que al volver la pestaña visible se relance `schedulePoll(true)`. |

Notas útiles:

- El polling usa `10s` visible y `30s` oculta.
- El request se hace con `cache: 'no-store'` y además se usa `urlNoCache(...)`, así que si los datos siguen viejos el problema suele estar aguas arriba, no en caché local simple.

### Stream sin sonido

| Síntoma | Causa probable | Qué revisar |
|---|---|---|
| La UI dice reproducir pero no se escucha | Volumen/mute, autoplay bloqueado o stream degradado | Revisar `ks_muted_v2`, `ks_volume_v2`, estado real de `<audio>`, eventos `waiting/stalled/emptied/error` y si `recover()` se está disparando. |
| En móvil no aparece UI de volumen | Decisión deliberada por heurística de dispositivo | Confirmar `ns.device.profile.shouldHideVolumeUi`; en ese caso el diseño espera usar botones físicos del dispositivo. |
| En contenedor nativo no suena igual que web | Está entrando el bridge `MediaControls` en vez del `<audio>` del navegador | Verificar si `window.Capacitor?.Plugins?.MediaControls` existe y si `ns.native.play()` responde correctamente. |

### Diferencias entre `player2.0.html` y `player2.0stream.html`

| Tema | `player2.0.html` | `player2.0stream.html` |
|---|---|---|
| Objetivo | experiencia completa | widget/card compacta |
| Tema | conmutación normal claro/oscuro | dark forzado |
| UI visible | controles e historial completos | UI muy reducida |
| Volumen | persistido según preferencias | forzado a `100` |
| Mute | persistido | forzado a `false` |
| Autoplay | conservador | agresivo, con múltiples intentos de unlock |

Regla práctica: si el problema aparece SOLO en `player2.0stream.html`, casi siempre está ligado a sus overrides de tema/volumen/autoplay y no al stack base compartido.

## 16. Guía rápida para quien mantiene el player

### Si vas a tocar...

| Objetivo | Empieza por |
|---|---|
| tema, volumen, mute o render | `js/player-ui.js` |
| stream, polling o recuperación | `js/player-audio.js` |
| resize dentro del `iframe` | `js/player-height.js` |
| soporte Android/Capacitor | `js/player-native.js` + host en `index.html` |
| variante compacta | `player2.0stream.html` |

### Orden recomendado de lectura técnica

1. `player2.0.html`
2. `js/player-core.js`
3. `js/player-ui.js`
4. `js/player-audio.js`
5. `js/player-height.js`
6. `js/player-native.js`
7. `player2.0stream.html`

## 17. Resumen ejecutivo

El player está razonablemente bien separado por responsabilidades: core compartido, device heuristics, resize, bridge nativo, UI, audio y bootstrap. El mayor valor técnico del sistema está en `player-audio.js`, porque ahí viven metadata, resiliencia y reproducción real. Este documento queda como referencia profunda del embed; el `README.md` principal queda reservado para mapa del proyecto y onboarding general.

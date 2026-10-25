# Tambo

Portal único de las apps personales y de prueba: una pantalla con todas las apps
agrupadas por proyecto, estado en vivo, buscador y portadas visuales, instalable
como PWA. Corre como servidor de desarrollo de Vite+ con un plugin propio; las
apps siguen corriendo donde ya corrían y Caddy les da nombres limpios.

## Acceso desde el Mac (interino, sin DNS propio)

Mientras no existan los registros DNS ni el Caddy definitivo, el portal está
expuesto con Tailscale Serve, como el resto de las apps de la VM:

- URL: `https://oracle.tail4a8b59.ts.net:15171/` (solo dentro de la tailnet).
- Servicio: `tambo-dev.service` (systemd de usuario, siempre encendido; es la
  puerta de las demás apps y sondea salud cada 30 s, no escala a cero).
- El host interino vive en `TAMBO_ALLOWED_HOSTS` (`vite.config.ts`).

Para desmontarlo cuando llegue el Caddy:

```bash
sudo tailscale serve --https=15171 off
systemctl --user disable --now tambo-dev
```

## Puesta en marcha definitiva

```bash
cp .env.example .env    # y cargar DNS_API_TOKEN de Cloudflare
docker compose up -d
```

- Tambo escucha en `127.0.0.1:15170` (red del host) y sirve la interfaz, la API
  y los estáticos de `data/`.
- Caddy termina TLS (DNS-01 contra Cloudflare) atado a la IP de Tailscale
  `100.114.65.117` y enruta por nombre de host: el portal y cada app.
- `data/apps.json` es la única fuente de verdad: editable a mano, desde la
  interfaz o por un agente; cualquier cambio se refleja en vivo por un evento
  HMR propio, sin recargar.

## Desarrollo sin Docker

```bash
cd app
bun install
bun run dev        # espera ../data/apps.json
bun run check      # formato, lint y tipos
bun run test       # vitest
bun run build
bun run icons      # regenera los PNG de la PWA (sharp)
```

## API interna

| Ruta | Uso |
| --- | --- |
| `GET /api/config` | Configuración validada con cabecera `ETag` |
| `PUT /api/config` | Reemplaza `apps.json`; exige `If-Match`, `X-Tambo: 1` y `Origin` del portal. `412` si cambió, `422` si no valida, `.bak` antes de escribir |
| `GET /api/health` | Mapa `{ appId: { status, code, ms, checkedAt } }` |
| `POST /api/health/refresh` | Fuerza un chequeo inmediato |
| `GET /api/services` | Estado de las unidades systemd declaradas, por app, con RAM y CPU por cgroup y el resumen de la VM |
| `POST /api/services/<appId>` | `{ "action": "start" \| "stop" }` sobre la unidad de esa app |
| `GET /shots/<id>.webp`, `GET /assets/*` | Estáticos de `data/` con lista cerrada |
| `POST /api/assets?name=slug.svg` | Sube SVG/PNG/WebP de hasta 2 MB (fase 2) |

## Interfaz

- **Vista compacta (por defecto) y vista Portadas**: la preferencia vive por
  navegador en `localStorage` (`tambo.view`), nunca en `apps.json`; lo mismo
  para el tema (`tambo.theme`), los grupos colapsados (`tambo.collapsed`) y el
  interruptor de atajos `e`/`t`/`1-9` (`tambo.shortcuts`). Toda lectura y
  escritura de almacenamiento lleva manejo de errores: si falla, la sesión
  usa los valores por omisión.
- **Identidad de una app** (igual en anclados y tarjetas): el icono es
  independiente de la portada. Icono: `brand:<archivo>.svg` (logo oficial
  con su color propio, p. ej. el coral de Storybook, tiene prioridad sobre
  la portada), `tambo:<glifo>` del sprite incluido, `lucide:<nombre>` o
  emoji. Portada (jerarquía): captura real (`shot`) → recurso propio
  (`svg`/`image` en `data/assets/`) → ilustración funcional del kit
  (`data/assets/covers/`) → respaldo simple. No se descargan favicons. El
  sprite va incrustado en el documento (los `<use>` externos a archivo no
  siempre renderizan) y el trazo se propaga por CSS.
- **Estados**: Activa, Sin respuesta (tras dos fallos consecutivos del
  servidor), Sin comprobar (sin chequeo aún) y el aviso global de datos
  desactualizados cuando falla la actualización de salud, que conserva los
  últimos valores y ofrece Reintentar.
- **Recursos**: el control del encabezado se llama "Servidor OCI" y no
  muestra cifras: el panel despliega CPU (% del total de la VM y sus
  núcleos), RAM usada/total, carga, el origen (cgroups del host de la VM,
  nunca el MacBook) y la hora de la última lectura. Cuando una unidad sirve
  a varias apps (El Cáliz comparte `elcaliz-dev.service`), sus contadores son
  del conjunto y no se atribuyen a cada app: en Detalles se muestra "No
  disponible por app" con la explicación.
- **Densidad**: tarjetas compactas de 132 px de altura base (crecen con el
  contenido), pie común con entorno y estado anclado al fondo, hasta cinco
  columnas en ventanas anchas, 16 px entre título y cuadrícula y 28 px entre
  secciones. `prod` y `dev` comparten estructura de chip; el verde queda
  reservado a la salud. El encabezado tiene fondo opaco (verificado con
  scroll real) y contraste AA medido por cálculo en ambos temas.
- **Atajos**: `/` y Cmd+K (Ctrl K fuera de macOS) enfocan la búsqueda;
  Escape cierra primero el menú o panel superior y después limpia la
  búsqueda; `e`, `t` y `1-9` son conmutables y no actúan nunca mientras se
  escribe o se compone texto (IME).

## Encendido, apagado y recursos desde el portal

Una app puede declarar su unidad systemd **de usuario** en `apps.json`:

```json
"service": "elcaliz-dev.service"
```

Con eso, al hacer clic en una app dormida se despierta automáticamente
(Sablier) y se abre una página intermedia que redirige cuando está lista.
El menú contextual y el drawer de detalles permiten encender/apagar
manualmente. Reglas de seguridad: la unidad siempre sale de
`apps.json` (nunca de la petición), las acciones exigen `X-Tambo: 1` y `Origin`
del portal, y se ejecutan con `systemctl --user` contra el bus de la sesión
del propietario. Varias apps pueden compartir una unidad (El Cáliz entera es
`elcaliz-dev.service`); el estado se consulta una sola vez por unidad.

Además, para cada unidad activa el portal lee su **cgroup v2**: muestra en el
pie de la tarjeta la RAM real (`memory.stat: anon`, todo el árbol de procesos
de la unidad) y el CPU como porcentaje del total de la VM (delta de
`cpu.stat` entre muestreos de 15 s), y en la cabecera el resumen de la
máquina (CPU, RAM usada de la total, carga). El primer periodo tras arrancar
no tiene CPU hasta que exista un delta.

En el despliegue con Docker esto necesita acceso al bus de systemd: montar
`/run/user/1000/bus` y exportar `DBUS_SESSION_BUS_ADDRESS`. Quedó pendiente
para cuando llegue el contenedor; hoy funciona con la unidad `tambo-dev`.

## Escala a cero con Sablier

Las apps que declaran `service` pueden marcarse con `[X-Sablier]` en su
unidad systemd. El portal se integra con Sablier (API en `:10001`) para:

- **Auto-encendido**: al hacer clic en una app dormida, el portal pide a
  Sablier que la despierte y abra una sesión (30 min por defecto,
  configurable por app con `sessionMinutes`).
- **Escala a cero**: tras la sesión sin tráfico, Sablier detiene la instancia.
- **UI**: chip "En sesión / Dormida" en tarjetas, cuenta regresiva, barra de
  progreso en el drawer, resumen de RAM liberada en el panel servidor.
- **Página intermedia**: `/wake.html` muestra "Despertando…" y redirige
  cuando el health check pasa.

Sablier se ejecuta como servicio de usuario (`sablier-systemd.service`) con
`--provider.auto-warm-externally-started` para no matar unidades arrancadas
desde el portal.

## DNS y red (pendiente de crear los registros)

El DNS de `andresgaibor.com` está en Cloudflare. Registros A hacia
`100.114.65.117` (solo alcanzable dentro de la tailnet):

- `tambo.lab.andresgaibor.com`
- comodín por proyecto: `*.elcaliz.lab.andresgaibor.com`
- hosts sueltos: `dmon.lab.andresgaibor.com`

Titula ya tiene producción propia (`titula.andresgaibor.com` vía Traefik) y no
pasa por este Caddy.

### Conflictos a resolver antes del primer `up` (decisión de despliegue)

Hoy el 80/443 de la VM están ocupados y `tailscale serve` publica las apps:

- `traefik` escucha en `0.0.0.0:80` y `10.0.0.77:443`.
- `tailscaled` escucha en `100.114.65.117:443` y publica cada app por puerto
  (elcaliz-tailscale-serve.service).

El Caddy de Tambo necesita `100.114.65.117:443`, así que migrar implica apagar
`elcaliz-tailscale-serve` (y el resto de `tailscale serve`) al mismo tiempo.
Traefik no estorna mientras siga atado a la IP pública. Ninguna app debe abrir
puerto en la lista de seguridad de OCI.

### Cambios necesarios en las apps

Con Caddy delante, cada app Vite de la VM debe: escuchar en `127.0.0.1`,
incluir su nuevo host en `server.allowedHosts` y fijar `server.hmr.clientPort`
en 443 para que el websocket del HMR atraviese el proxy.

## Puertos reales mapeados (VM oci)

| App | Local | Host limpio |
| --- | --- | --- |
| ERP El Cáliz | 127.0.0.1:15173 | oracle.tail4a8b59.ts.net:15176 |
| Admin El Cáliz | 127.0.0.1:15174 | oracle.tail4a8b59.ts.net:15175 |
| API El Cáliz (`/salud`) | 127.0.0.1:18787 | oracle.tail4a8b59.ts.net:18788/salud |
| Storybook (web) | 127.0.0.1:6007 | oracle.tail4a8b59.ts.net:6006 |
| Asistente | 127.0.0.1:5174 | oracle.tail4a8b59.ts.net:5176 |
| Delegation Monitor | 127.0.0.1:5173 | oracle.tail4a8b59.ts.net:3301 |
| Titula (prod) | via Traefik | titula.andresgaibor.com |

## Estado de las fases

- Fase 1 (MVP): completa. Falta la verificación desde el Mac, que requiere los
  registros DNS y el despliegue.
- Fase 2 (edición): `PUT /api/config`, evento HMR al cambiar el archivo, modo
  edición con arrastre (`@dnd-kit`), alta y baja, subida de portadas,
  importar y exportar (`ConfigIO`).
- Fase 3 (capturas con Playwright): pendiente; el servicio `shots` está
  esbozado como comentario en `compose.yaml`.

## Decisiones abiertas

- Proveedor DNS: resuelto como Cloudflare (módulo `caddy-dns/cloudflare`).
- Puerto del Storybook: `storybook dev -p 6006` en `apps/web` de ElCaliz.
- Service worker en desarrollo: no se registra (`import.meta.env.PROD`); si
  Chrome exigiera uno para instalar, se evalúa uno que excluya las rutas del
  HMR.

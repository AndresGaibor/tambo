# Tambo

Portal único de las apps personales y de prueba: una pantalla con todas las apps
agrupadas por proyecto, estado en vivo, buscador y portadas visuales, instalable
como PWA. Corre como servidor de desarrollo de Vite+ con un plugin propio; las
apps siguen corriendo donde ya corrían y Caddy les da nombres limpios.

## Puesta en marcha

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
pnpm install
pnpm dev        # espera ../data/apps.json
pnpm check      # formato, lint y tipos
pnpm test       # vitest
pnpm build
pnpm icons      # regenera los PNG de la PWA (sharp)
```

## API interna

| Ruta | Uso |
| --- | --- |
| `GET /api/config` | Configuración validada con cabecera `ETag` |
| `PUT /api/config` | Reemplaza `apps.json`; exige `If-Match`, `X-Tambo: 1` y `Origin` del portal. `412` si cambió, `422` si no valida, `.bak` antes de escribir |
| `GET /api/health` | Mapa `{ appId: { status, code, ms, checkedAt } }` |
| `POST /api/health/refresh` | Fuerza un chequeo inmediato |
| `GET /shots/<id>.webp`, `GET /assets/*` | Estáticos de `data/` con lista cerrada |
| `POST /api/assets?name=slug.svg` | Sube SVG/PNG/WebP de hasta 2 MB (fase 2) |

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
| ERP El Cáliz | 127.0.0.1:15173 | erp.elcaliz.lab.andresgaibor.com |
| Admin El Cáliz | 127.0.0.1:15174 | admin.elcaliz.lab.andresgaibor.com |
| API El Cáliz (`/salud`) | 127.0.0.1:18787 | api.elcaliz.lab.andresgaibor.com |
| Storybook (web) | 127.0.0.1:6006 | sb.elcaliz.lab.andresgaibor.com |
| Asistente | 127.0.0.1:5174 | asistente.elcaliz.lab.andresgaibor.com |
| Delegation Monitor | 127.0.0.1:5173 | dmon.lab.andresgaibor.com |
| Titula (prod) | via Traefik | titula.andresgaibor.com |

## Estado de las fases

- Fase 1 (MVP): completa. Falta la verificación desde el Mac, que requiere los
  registros DNS y el despliegue.
- Fase 2 (edición): `PUT /api/config`, evento HMR al cambiar el archivo, modo
  edición con arrastre (`@dnd-kit`), alta y baja, subida de portadas. Importar
  y exportar quedan pendientes.
- Fase 3 (capturas con Playwright): pendiente; el servicio `shots` está
  esbozado como comentario en `compose.yaml`.

## Decisiones abiertas

- Proveedor DNS: resuelto como Cloudflare (módulo `caddy-dns/cloudflare`).
- Puerto del Storybook: `storybook dev -p 6006` en `apps/web` de ElCaliz.
- Service worker en desarrollo: no se registra (`import.meta.env.PROD`); si
  Chrome exigiera uno para instalar, se evalúa uno que excluya las rutas del
  HMR.

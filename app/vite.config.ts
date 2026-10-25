import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";
import { tamboPlugin } from "./server/plugin";

const port = Number(process.env.TAMBO_PORT ?? 15170);
// Detrás de Caddy el websocket del HMR debe entrar por el 443.
const hmrClientPort = process.env.TAMBO_HMR_CLIENT_PORT
  ? Number(process.env.TAMBO_HMR_CLIENT_PORT)
  : undefined;
// El host del portal y, mientras no haya DNS propio, el de Tailscale Serve.
const allowedHosts = (
  process.env.TAMBO_ALLOWED_HOSTS ?? "tambo.lab.andresgaibor.com,oracle.tail4a8b59.ts.net"
)
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);

export default defineConfig({
  plugins: [react(), tamboPlugin()],
  server: {
    host: "127.0.0.1",
    port,
    strictPort: true,
    allowedHosts,
    hmr: hmrClientPort ? { clientPort: hmrClientPort, overlay: false } : { overlay: false },
  },
  cacheDir: "/tmp/vite-tambo",
  // El build produce el shell offline servido bajo /shell/ por el plugin:
  // TAMBO_SHELL=1 pnpm build. El base no afecta al servidor de desarrollo.
  base: process.env.TAMBO_SHELL === "1" ? "/shell/" : "/",
  fmt: {},
  build: {
    sourcemap: false,
    outDir: "dist",
  },
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "server/**/*.test.ts"],
  },
});

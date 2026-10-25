import react from "@vitejs/plugin-react";
import { defineConfig } from "vite-plus";
import { tamboPlugin } from "./server/plugin";

const port = Number(process.env.TAMBO_PORT ?? 15170);
// Detrás de Caddy el websocket del HMR debe entrar por el 443.
const hmrClientPort = process.env.TAMBO_HMR_CLIENT_PORT
  ? Number(process.env.TAMBO_HMR_CLIENT_PORT)
  : undefined;

export default defineConfig({
  plugins: [react(), tamboPlugin()],
  server: {
    host: "127.0.0.1",
    port,
    strictPort: true,
    allowedHosts: ["tambo.lab.andresgaibor.com"],
    hmr: hmrClientPort ? { clientPort: hmrClientPort } : undefined,
  },
  cacheDir: "/tmp/vite-tambo",
  fmt: {},
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

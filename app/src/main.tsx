import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/jetbrains-mono";
import "./styles/app.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service worker también en desarrollo (decisión abierta de la spec):
// es lo que hace instalable el portal desde el servidor de desarrollo.
// El sw.js es red-primero para navegación y bundle, no cachea módulos de
// origen ni toca el websocket del HMR, así que no estorba.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js");
  });
}

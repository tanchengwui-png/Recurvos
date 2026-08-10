import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerPwaServiceWorker } from "./lib/pwa";

registerPwaServiceWorker();

// Native number inputs change their value when they have focus and the mouse
// wheel is used. Remove focus before the browser handles the wheel event so
// scrolling the page cannot accidentally alter a form value.
window.addEventListener("wheel", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.type === "number") {
    target.blur();
  }
}, { capture: true });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

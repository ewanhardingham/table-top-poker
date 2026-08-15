import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import "./app-shell.css";
import { SeatOrientationPrototype } from "./prototype/SeatOrientationPrototype.js";
import "./prototype/seat-orientation-prototype.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("#root element not found");
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    {import.meta.env.DEV &&
    window.location.pathname === "/prototype/seat-orientation" ? (
      <SeatOrientationPrototype />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);

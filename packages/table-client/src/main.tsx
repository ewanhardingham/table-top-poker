import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import "./app-shell.css";
import { ShowdownRevealPrototype } from "./prototype/ShowdownRevealPrototype.js";
import "./prototype/showdown-reveal-prototype.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("#root element not found");
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    {import.meta.env.DEV &&
    window.location.pathname === "/prototype/showdown-reveal" ? (
      <ShowdownRevealPrototype />
    ) : (
      <App />
    )}
  </React.StrictMode>,
);

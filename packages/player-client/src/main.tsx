import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { lockViewport } from "./lockViewport.js";
import "./app-shell.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("#root element not found");
}

lockViewport(document);

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

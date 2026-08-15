// PROTOTYPE — throwaway. See prototype-position-marker/README.md.
import React from "react";
import ReactDOM from "react-dom/client";
import { Prototype } from "./Prototype.js";
import "../app-shell.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("#root element not found");
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <Prototype />
  </React.StrictMode>,
);

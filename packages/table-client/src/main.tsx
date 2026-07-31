import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { HandPickerPrototype } from "./prototype/hand-picker/HandPickerPrototype.js";
import "./app-shell.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("#root element not found");
}

// PROTOTYPE gate — throwaway, wayfinder ticket #81. `?prototype=hand-picker`.
const prototype = new URLSearchParams(window.location.search).get("prototype");

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    {prototype === "hand-picker" ? <HandPickerPrototype /> : <App />}
  </React.StrictMode>,
);

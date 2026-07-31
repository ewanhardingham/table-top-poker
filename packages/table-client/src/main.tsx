import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { HandPickerPrototype } from "./prototype/hand-picker/HandPickerPrototype.js";
import { ReplayTransportPrototype } from "./prototype/replay-transport/ReplayTransportPrototype.js";
import "./app-shell.css";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("#root element not found");
}

// PROTOTYPE gate — throwaway. `?prototype=hand-picker` (wayfinder #81) or
// `?prototype=replay-transport` (wayfinder #82).
const prototype = new URLSearchParams(window.location.search).get("prototype");

function root() {
  if (prototype === "hand-picker") return <HandPickerPrototype />;
  if (prototype === "replay-transport") return <ReplayTransportPrototype />;
  return <App />;
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>{root()}</React.StrictMode>,
);

import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { fetchConfig } from "./api/rooms.js";
import "./app-shell.css";
import { useTableStore } from "./store/store.js";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("#root element not found");
}

// Discover server-global capabilities once per page load. The store defaults
// to the safe/off state if the endpoint is unavailable, so a transient fetch
// failure never exposes test-only UI by accident.
void fetchConfig()
  .then(({ testMode }) => {
    useTableStore.getState().setTestMode(testMode);
  })
  .catch((error: unknown) => {
    console.error(error);
  });

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

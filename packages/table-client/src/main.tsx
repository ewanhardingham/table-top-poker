import React from "react";
import ReactDOM from "react-dom/client";
import { StoredCardBackDesignProvider } from "@table-top-poker/ui-shared";
import { App } from "./App.js";
import { fetchConfig } from "./api/rooms.js";
import "./app-shell.css";
import { useTableStore } from "./store/store.js";

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("#root element not found");
}

void fetchConfig()
  .then(({ testMode }) => {
    useTableStore.getState().setTestMode(testMode);
  })
  .catch((error: unknown) => {
    console.error(error);
  });

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <StoredCardBackDesignProvider storageKey="ttp:table-card-back">
      <App />
    </StoredCardBackDesignProvider>
  </React.StrictMode>,
);

import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { ShowdownCardsPrototype } from "./prototype/ShowdownCardsPrototype.js";
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

/* PROTOTYPE — throwaway switch; see src/prototype/ShowdownCardsPrototype.tsx. */
const isPrototype =
  new URLSearchParams(window.location.search).get("prototype") ===
  "showdown-cards";

const root = ReactDOM.createRoot(rootEl);
function draw(): void {
  root.render(
    <React.StrictMode>
      {isPrototype ? <ShowdownCardsPrototype /> : <App />}
    </React.StrictMode>,
  );
}
window.addEventListener("prototype-nav", draw);
draw();

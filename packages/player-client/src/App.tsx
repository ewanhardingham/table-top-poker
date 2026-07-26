import { Card } from "@table-top-poker/ui-shared";
import React from "react";
import { useWebSocket } from "./hooks/useWebSocket.js";
import { usePlayerStore } from "./store/index.js";

export const App: React.FC = () => {
  useWebSocket();

  const connectionStatus = usePlayerStore((state) => state.connectionStatus);

  return (
    <div className="app-shell" data-testid="player-client-shell">
      <header className="header-bar">
        <h1 style={{ margin: 0, fontSize: "16px", fontWeight: 600 }}>
          Table Top Poker — Player
        </h1>
        <div className="status-badge" data-testid="connection-status">
          <span className={`status-dot ${connectionStatus}`} />
          <span style={{ textTransform: "capitalize" }}>
            {connectionStatus}
          </span>
        </div>
      </header>

      <main className="player-main">
        <div style={{ textAlign: "center" }}>
          <h2 style={{ margin: 0, fontSize: "20px", color: "#38bdf8" }}>
            Your Cards
          </h2>
          <p style={{ color: "#94a3b8", fontSize: "13px", marginTop: "4px" }}>
            Placeholder hand
          </p>
        </div>

        <div className="cards-container" data-testid="hole-cards">
          <Card rank="A" suit="spades" />
          <Card rank="K" suit="spades" />
        </div>
      </main>

      <footer className="actions-panel" data-testid="action-buttons">
        <button className="action-btn fold">Fold</button>
        <button className="action-btn check">Check</button>
        <button className="action-btn call">Call</button>
        <button className="action-btn raise">Raise</button>
      </footer>
    </div>
  );
};

export default App;

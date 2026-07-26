import { Card } from "@table-top-poker/ui-shared";
import React from "react";
import { useWebSocket } from "./hooks/useWebSocket.js";
import { useTableStore } from "./store/index.js";

export const App: React.FC = () => {
  useWebSocket();

  const connectionStatus = useTableStore((state) => state.connectionStatus);

  return (
    <div className="app-shell" data-testid="table-client-shell">
      <header className="header-bar">
        <h1 style={{ margin: 0, fontSize: "18px", fontWeight: 600 }}>
          Table Top Poker — Table Device
        </h1>
        <div className="status-badge" data-testid="connection-status">
          <span className={`status-dot ${connectionStatus}`} />
          <span style={{ textTransform: "capitalize" }}>
            {connectionStatus}
          </span>
        </div>
      </header>

      <main className="table-felt">
        <h2 style={{ margin: 0, fontSize: "24px", color: "#f59e0b" }}>
          Poker Table Shell
        </h2>
        <p style={{ color: "#94a3b8", fontSize: "14px", marginTop: "8px" }}>
          Waiting for room initialization...
        </p>

        <div className="cards-container" data-testid="community-cards">
          <Card rank="A" suit="spades" />
          <Card rank="K" suit="hearts" />
          <Card rank="10" suit="diamonds" />
          <Card faceDown />
          <Card faceDown />
        </div>
      </main>
    </div>
  );
};

export default App;

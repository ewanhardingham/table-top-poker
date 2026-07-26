import { Card } from "@table-top-poker/ui-shared";
import { usePlayerStore } from "./store/store.js";
import { useWebSocket } from "./ws/useWebSocket.js";

export function App() {
  useWebSocket();
  const connectionStatus = usePlayerStore((state) => state.connectionStatus);

  return (
    <div className="app-shell" data-testid="player-client-shell">
      <header className="status-bar">
        <span>Table Top Poker — Player</span>
        <span data-testid="connection-status" data-status={connectionStatus}>
          {connectionStatus}
        </span>
      </header>
      <main className="hand">
        <Card rank="K" suit="hearts" />
        <Card faceDown />
      </main>
    </div>
  );
}

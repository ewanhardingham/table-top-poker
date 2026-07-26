import { Card } from "@table-top-poker/ui-shared";
import { useTableStore } from "./store/store.js";
import { useWebSocket } from "./ws/useWebSocket.js";

export function App() {
  useWebSocket();
  const connectionStatus = useTableStore((state) => state.connectionStatus);

  return (
    <div className="app-shell" data-testid="table-client-shell">
      <header className="status-bar">
        <span>Table Top Poker — Table</span>
        <span data-testid="connection-status" data-status={connectionStatus}>
          {connectionStatus}
        </span>
      </header>
      <main className="felt">
        <Card rank="A" suit="spades" />
        <Card faceDown />
      </main>
    </div>
  );
}

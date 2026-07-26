import type { ConnectionStatus } from "./store/connectionSlice.js";

export interface StatusBarProps {
  readonly roomCode: string | null;
  readonly connectionStatus: ConnectionStatus;
}

/** No connection badge before a room exists — there's nothing to connect to yet. */
export function StatusBar({ roomCode, connectionStatus }: StatusBarProps) {
  return (
    <header className="status-bar">
      <span>Table Top Poker — Table</span>
      {roomCode !== null && (
        <span data-testid="connection-status" data-status={connectionStatus}>
          {connectionStatus}
        </span>
      )}
    </header>
  );
}

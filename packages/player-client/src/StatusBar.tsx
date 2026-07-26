import type { ConnectionStatus } from "./store/connectionSlice.js";

export interface StatusBarProps {
  readonly showBadge: boolean;
  readonly connectionStatus: ConnectionStatus;
}

/** No connection badge before a seat is claimed — there's nothing to connect to yet. */
export function StatusBar({ showBadge, connectionStatus }: StatusBarProps) {
  return (
    <header className="status-bar">
      <span>Table Top Poker — Player</span>
      {showBadge && (
        <span data-testid="connection-status" data-status={connectionStatus}>
          {connectionStatus}
        </span>
      )}
    </header>
  );
}

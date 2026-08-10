const JOIN_PATH = /^\/join\/([A-Za-z0-9]{4})$/;

/** Prefills the room-code field from a QR-scanned `/join/:code` URL. */
export function parseRoomCodeFromPath(pathname: string): string | null {
  const code = JOIN_PATH.exec(pathname)?.[1];
  return code ? code.toUpperCase() : null;
}

/**
 * The player-client URL path that names a joined room — the inverse of
 * `parseRoomCodeFromPath`. The server only serves the SPA at `/join/:code`
 * (the site root serves the table client), so a joined player always lives on
 * one of these paths.
 */
export function joinPathForCode(code: string): string {
  return `/join/${code}`;
}

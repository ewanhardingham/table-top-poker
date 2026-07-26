const JOIN_PATH = /^\/join\/([A-Za-z0-9]{4})$/;

/** Prefills the room-code field from a QR-scanned `/join/:code` URL. */
export function parseRoomCodeFromPath(pathname: string): string | null {
  const code = JOIN_PATH.exec(pathname)?.[1];
  return code ? code.toUpperCase() : null;
}

const JOIN_PATH = /^\/join\/([A-Za-z0-9]{4})$/;

export function parseRoomCodeFromPath(pathname: string): string | null {
  const code = JOIN_PATH.exec(pathname)?.[1];
  return code ? code.toUpperCase() : null;
}

export function joinPathForCode(code: string): string {
  return `/join/${code}`;
}

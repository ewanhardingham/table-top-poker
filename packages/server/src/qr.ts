import QRCode from "qrcode";

export function joinUrl(host: string, code: string): string {
  return `http://${host}/join/${code}`;
}

export function roomQrCodeDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url);
}

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { badRequest } from '../http.js';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function detectImage(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString('ascii') === 'PNG') return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 4).toString('ascii') === 'GIF8') return 'gif';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  return null;
}

export function decodeBase64(data: string): Buffer {
  const b64 = data.includes(',') ? data.slice(data.indexOf(',') + 1) : data;
  return Buffer.from(b64, 'base64');
}

/** Validates content by magic bytes (never by the client-supplied name) and stores under a random name. */
export function saveImage(dataBase64: string): string {
  const buf = decodeBase64(dataBase64);
  if (buf.length > MAX_IMAGE_BYTES) throw badRequest('file_too_large', { maxBytes: MAX_IMAGE_BYTES });
  const ext = detectImage(buf);
  if (!ext) throw badRequest('unsupported_file_type');
  const name = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(config.uploadsDir, name), buf);
  return `/uploads/${name}`;
}

export function isXlsx(buf: Buffer) {
  // XLSX is a ZIP container: "PK\x03\x04"
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { portraitPath, portraitsDir } from './profile';
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export function imageExtension(bytes: Buffer): string {
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  if (bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') return 'webp';
  throw new Error('Envie uma imagem PNG, JPG ou WebP válida.');
}
export async function savePortrait(id: string, attachment: { url: string; size: number }) {
  const target = portraitPath(id);
  if (attachment.size > MAX_IMAGE_BYTES) throw new Error('A imagem deve ter no máximo 2 MB.');
  const url = new URL(attachment.url);
  if (url.protocol !== 'https:' || !['cdn.discordapp.com', 'media.discordapp.net'].includes(url.hostname)) throw new Error('Use o campo de anexo do comando.');
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) });
  if (!response.ok || !response.body) throw new Error('Não foi possível baixar a imagem. Tente novamente.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > MAX_IMAGE_BYTES) throw new Error('A imagem deve ter no máximo 2 MB.');
      chunks.push(part.value);
    }
  } finally { await reader.cancel(); }
  const bytes = Buffer.concat(chunks);
  imageExtension(bytes);
  await fs.mkdir(portraitsDir, { recursive: true });
  const temporary = path.join(portraitsDir, `${randomUUID()}.tmp`);
  try { await fs.writeFile(temporary, bytes); await fs.rename(temporary, target); }
  finally { await fs.rm(temporary, { force: true }); }
}
export async function removePortrait(id: string) { await fs.rm(portraitPath(id), { force: true }); }

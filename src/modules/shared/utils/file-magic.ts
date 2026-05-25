import { open, unlink } from 'fs/promises';

const MAGIC: { buf: number[]; exts: string[] }[] = [
  { buf: [0xff, 0xd8, 0xff], exts: ['jpg', 'jpeg'] },
  { buf: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], exts: ['png'] },
  { buf: [0x47, 0x49, 0x46, 0x38], exts: ['gif'] },
  { buf: [0x47, 0x49, 0x46, 0x39], exts: ['gif'] },
  { buf: [0x25, 0x50, 0x44, 0x46], exts: ['pdf'] },
  { buf: [0xd0, 0xcf, 0x11, 0xe0], exts: ['doc'] },
  { buf: [0x50, 0x4b, 0x03, 0x04], exts: ['docx'] },
];

const ALLOWED_EXTS = new Set([
  'jpeg',
  'jpg',
  'png',
  'gif',
  'webp',
  'pdf',
  'doc',
  'docx',
]);

const HEAD_BYTES = 12;

function getExt(originalname: string): string {
  const i = originalname.lastIndexOf('.');
  return i >= 0 ? originalname.slice(i + 1).toLowerCase() : '';
}

async function readFileHead(filePath: string): Promise<Buffer> {
  const fh = await open(filePath, 'r');
  try {
    const buf = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await fh.read(buf, 0, HEAD_BYTES, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

export function validateMagicFromBuffer(
  head: Buffer,
  originalname: string,
): void {
  const ext = getExt(originalname);
  if (!ALLOWED_EXTS.has(ext)) {
    throw new Error('Invalid file extension');
  }

  if (
    head.length >= 12 &&
    head[0] === 0x52 &&
    head[1] === 0x49 &&
    head[2] === 0x46 &&
    head[3] === 0x46 &&
    head[8] === 0x57 &&
    head[9] === 0x45 &&
    head[10] === 0x42 &&
    head[11] === 0x50
  ) {
    if (ext === 'webp') return;
    throw new Error(`File content (webp) does not match extension .${ext}`);
  }

  for (const { buf, exts } of MAGIC) {
    const magicBuf = Buffer.from(buf);
    if (
      head.length >= magicBuf.length &&
      head.subarray(0, magicBuf.length).equals(magicBuf)
    ) {
      if (exts.includes(ext)) return;
      throw new Error(
        `File content (${exts[0]}) does not match extension .${ext}`,
      );
    }
  }
  throw new Error('File content could not be recognised as an allowed type');
}

export async function validateFileMagic(
  filePath: string,
  originalname: string,
): Promise<void> {
  const head = await readFileHead(filePath);
  validateMagicFromBuffer(head, originalname);
}

export async function unlinkIfExists(path: string): Promise<void> {
  await unlink(path).catch(() => {});
}

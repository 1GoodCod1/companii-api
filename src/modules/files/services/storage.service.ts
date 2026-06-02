import {
  createReadStream,
  type ReadStream,
  type Stats,
} from 'fs';
import { open, stat, unlink } from 'fs/promises';
import { isAbsolute, join, relative, resolve, sep } from 'path';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import type { Readable } from 'stream';
import {
  AppErrorMessages,
  AppErrors,
} from '../../../common/errors';
import { FileVisibility } from '@prisma/client';

const B2_REGION_REGEX = /^[a-z]{2}-[a-z]+-\d{3}$/;

@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly logger = new Logger(StorageService.name);
  private readonly s3: S3Client | null;
  private readonly publicBucket: string;
  private readonly privateBucket: string;
  private readonly publicBaseUrl: string;
  private readonly endpointBase: string;
  private readonly uploadRoot: string;
  private readonly isProd: boolean;

  constructor(config: ConfigService) {
    const keyId = config.get<string>('b2.applicationKeyId') ?? '';
    const key = config.get<string>('b2.applicationKey') ?? '';
    this.publicBucket = config.get<string>('b2.publicBucket') ?? '';
    this.privateBucket = config.get<string>('b2.privateBucket') ?? '';
    this.isProd = config.get<string>('nodeEnv') === 'production';

    const region = this.resolveRegion(config.get<string>('b2.region'));
    this.endpointBase = this.resolveEndpoint(
      config.get<string>('b2.endpoint'),
      region,
    );
    this.publicBaseUrl = (config.get<string>('b2.publicBaseUrl') ?? '')
      .trim()
      .replace(/\/$/, '');

    const haveCreds = Boolean(
      keyId && key && this.publicBucket && this.privateBucket,
    );

    if (haveCreds) {
      this.s3 = new S3Client({
        credentials: { accessKeyId: keyId, secretAccessKey: key },
        region,
        endpoint: this.endpointBase,
        forcePathStyle: true,
      });
      this.logger.log(
        `Storage: Backblaze B2 (region=${region}, public=${this.publicBucket}, private=${this.privateBucket})`,
      );
    } else if (this.isProd) {
      throw new Error(
        'Storage: Backblaze B2 not configured in production. ' +
          'Set B2_APPLICATION_KEY_ID / B2_APPLICATION_KEY / B2_PUBLIC_BUCKET / B2_PRIVATE_BUCKET.',
      );
    } else {
      this.s3 = null;
      this.logger.warn(
        'Storage: LOCAL disk (./uploads). Set B2 env vars for Backblaze B2.',
      );
    }

    const uploadDir = config.get<string>('files.uploadDir') ?? './uploads';
    this.uploadRoot = resolve(
      isAbsolute(uploadDir) ? uploadDir : join(process.cwd(), uploadDir),
    );
  }

  onModuleDestroy(): void {
    this.s3?.destroy();
  }

  get usingB2(): boolean {
    return this.s3 !== null;
  }

  bucketFor(visibility: FileVisibility): string {
    return visibility === FileVisibility.PUBLIC
      ? this.publicBucket
      : this.privateBucket;
  }

  publicUrlFor(key: string): string {
    const cleanKey = key.replace(/^\/+/, '');
    if (this.publicBaseUrl) return `${this.publicBaseUrl}/${cleanKey}`;
    return `${this.endpointBase}/${this.publicBucket}/${cleanKey}`;
  }

  decodeStoredPath(storedPath: string):
    | { kind: 'local'; absolutePath: string }
    | { kind: 'b2'; bucket: string; key: string } {
    if (storedPath.startsWith('b2://')) {
      const rest = storedPath.slice('b2://'.length);
      const slash = rest.indexOf('/');
      if (slash <= 0) {
        throw AppErrors.forbidden(AppErrorMessages.FILES_ACCESS_DENIED);
      }
      return {
        kind: 'b2',
        bucket: rest.slice(0, slash),
        key: rest.slice(slash + 1),
      };
    }

    return { kind: 'local', absolutePath: this.resolveSafeLocalPath(storedPath) };
  }

  encodeB2(bucket: string, key: string): string {
    return `b2://${bucket}/${key.replace(/^\/+/, '')}`;
  }

  async getFileHead(
    storedPath: string,
    bytes: number,
  ): Promise<Buffer | null> {
    try {
      const decoded = this.decodeStoredPath(storedPath);
      if (decoded.kind === 'local') {
        const fh = await open(decoded.absolutePath, 'r');
        try {
          const buf = Buffer.alloc(bytes);
          await fh.read(buf, 0, bytes, 0);
          return buf;
        } finally {
          await fh.close();
        }
      }

      if (!this.s3) return null;
      const resp = await this.s3.send(
        new GetObjectCommand({
          Bucket: decoded.bucket,
          Key: decoded.key,
          Range: `bytes=0-${bytes - 1}`,
        }),
      );
      return this.collectBodyBuffer(resp);
    } catch (err) {
      this.logger.warn(
        `getFileHead failed for ${storedPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  async openReadStream(storedPath: string): Promise<{
    stream: Readable | ReadStream;
    size: number;
    contentType: string | null;
  }> {
    const decoded = this.decodeStoredPath(storedPath);
    if (decoded.kind === 'local') {
      let fileStat: Stats;
      try {
        fileStat = await stat(decoded.absolutePath);
      } catch {
        throw AppErrors.notFound(AppErrorMessages.FILES_NOT_FOUND);
      }
      return {
        stream: createReadStream(decoded.absolutePath),
        size: fileStat.size,
        contentType: null,
      };
    }

    if (!this.s3) {
      throw AppErrors.notFound(AppErrorMessages.FILES_NOT_FOUND);
    }
    const resp = await this.s3.send(
      new GetObjectCommand({ Bucket: decoded.bucket, Key: decoded.key }),
    );
    if (!resp.Body) {
      throw AppErrors.notFound(AppErrorMessages.FILES_NOT_FOUND);
    }
    return {
      stream: resp.Body as Readable,
      size: resp.ContentLength ?? 0,
      contentType: resp.ContentType ?? null,
    };
  }

  async deleteByStoredPath(storedPath: string): Promise<void> {
    try {
      const decoded = this.decodeStoredPath(storedPath);
      if (decoded.kind === 'local') {
        await unlink(decoded.absolutePath).catch(() => {});
        return;
      }
      if (!this.s3) return;
      await this.s3.send(
        new DeleteObjectCommand({ Bucket: decoded.bucket, Key: decoded.key }),
      );
    } catch (err) {
      this.logger.warn(
        `deleteByStoredPath failed for ${storedPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  async uploadBuffer(
    visibility: FileVisibility,
    key: string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    const cleanKey = key.replace(/^\/+/, '');
    if (this.s3) {
      const bucket = this.bucketFor(visibility);
      await this.s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: cleanKey,
          Body: buffer,
          ContentType: contentType,
          ContentDisposition:
            visibility === FileVisibility.PUBLIC ? 'inline' : 'attachment',
        }),
      );
      return this.encodeB2(bucket, cleanKey);
    }

    const localKey = cleanKey.replace(/^uploads\//, '');
    const localPath = resolve(this.uploadRoot, localKey);
    const rel = relative(this.uploadRoot, localPath);
    if (rel.startsWith('..') || rel.split(sep).includes('..')) {
      throw AppErrors.forbidden(AppErrorMessages.FILES_ACCESS_DENIED);
    }
    const { writeFile, mkdir } = await import('fs/promises');
    await mkdir(this.uploadRoot, { recursive: true });
    await writeFile(localPath, buffer);
    return `/uploads/${localKey}`;
  }

  private resolveRegion(raw: string | undefined): string {
    if (!raw) return 'eu-central-003';
    if (!B2_REGION_REGEX.test(raw)) return 'eu-central-003';
    return raw;
  }

  private resolveEndpoint(custom: string | undefined, region: string): string {
    const fallback = `https://s3.${region}.backblazeb2.com`;
    const trimmed = (custom ?? '').trim();
    if (!trimmed) return fallback;
    try {
      const u = new URL(trimmed);
      if (u.protocol !== 'https:') return fallback;
      if (!u.hostname.endsWith('.backblazeb2.com')) return fallback;
      return u.origin;
    } catch {
      return fallback;
    }
  }

  private resolveSafeLocalPath(publicPath: string): string {
    if (
      !publicPath ||
      publicPath.includes('\0') ||
      /^[a-z][a-z0-9+.-]*:\/\//i.test(publicPath)
    ) {
      throw AppErrors.forbidden(AppErrorMessages.FILES_ACCESS_DENIED);
    }
    const stripped = publicPath.replace(/^\/+/, '');
    const candidate = resolve(this.uploadRoot, stripped);
    const rel = relative(this.uploadRoot, candidate);
    if (rel.startsWith('..') || rel.split(sep).includes('..') || isAbsolute(rel)) {
      throw AppErrors.forbidden(AppErrorMessages.FILES_ACCESS_DENIED);
    }
    return candidate;
  }

  private async collectBodyBuffer(
    resp: GetObjectCommandOutput,
  ): Promise<Buffer | null> {
    if (!resp.Body) return await null;
    const chunks: Uint8Array[] = [];
    for await (const chunk of resp.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return await Buffer.concat(chunks);
  }
}

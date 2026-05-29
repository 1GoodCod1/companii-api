import type { Readable } from 'stream';

export const PDF_GENERATOR = Symbol('PdfGenerator');

export interface PdfGeneratorOptions {
  isClientView?: boolean;
  locale?: 'ro' | 'ru';
}

export interface PdfGenerator {
  build(project: Record<string, unknown>, options?: PdfGeneratorOptions): Promise<Buffer>;
  buildStream(project: Record<string, unknown>, options?: PdfGeneratorOptions): Promise<Readable>;
}
import path from 'path';
import PDFDocument from 'pdfkit';

export class BasePdfService {
  protected initPdfDocument(options: PDFKit.PDFDocumentOptions = { size: 'A4', margin: 48 }): {
    doc: PDFKit.PDFDocument;
    finished: Promise<Buffer>;
  } {
    const doc = new PDFDocument(options);
    const fontRegularPath = path.join(process.cwd(), 'assets', 'fonts', 'Arial-Regular.ttf');
    const fontBoldPath = path.join(process.cwd(), 'assets', 'fonts', 'Arial-Bold.ttf');
    doc.registerFont('Arial', fontRegularPath);
    doc.registerFont('Arial-Bold', fontBoldPath);
    doc.font('Arial');
    
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const finished = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    return { doc, finished };
  }
}

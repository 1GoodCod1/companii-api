import { Injectable } from '@nestjs/common';
import path from 'path';
import PDFDocument from 'pdfkit';
import type { Company, CompanyCustomer, Quote, QuoteLine } from '@prisma/client';

import { formatDate, formatMoney } from './pdf-format.util';

type QuotePdfData = Quote & {
  company: Pick<
    Company,
    | 'name'
    | 'legalName'
    | 'idno'
    | 'legalAddress'
    | 'contactPhone'
    | 'contactEmail'
    | 'isTvaPayer'
    | 'tvaCode'
  >;
  customer: CompanyCustomer;
  lines: QuoteLine[];
};

@Injectable()
export class QuotePdfService {
  async build(data: QuotePdfData): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 48 });

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

    const total = Number(data.total);

    doc.rect(0, 0, doc.page.width, 120).fill('#6D28D9');
    doc.fillColor('#FFFFFF').fontSize(22).font('Arial-Bold').text('DEVIZ / OFERTĂ', 48, 42);
    doc.fontSize(11).font('Arial').text(data.company.name, 48, 72);
    doc.fontSize(10).text(`Nr. ${data.number}`, 48, 92);

    doc.fillColor('#111827').font('Arial-Bold').fontSize(10).text('EMITENT', 48, 140);
    doc.font('Arial').fontSize(9).fillColor('#374151');
    doc.text(data.company.legalName || data.company.name, 48, 156);
    if (data.company.idno) doc.text(`IDNO: ${data.company.idno}`, 48, doc.y + 2);
    if (data.company.legalAddress) doc.text(data.company.legalAddress, 48, doc.y + 2);
    if (data.company.contactPhone) doc.text(`Tel: ${data.company.contactPhone}`, 48, doc.y + 2);

    const rightX = 320;
    doc.fillColor('#111827').font('Arial-Bold').fontSize(10).text('CLIENT', rightX, 140);
    doc.font('Arial').fontSize(9).fillColor('#374151');
    doc.text(data.customer.fullName, rightX, 156);
    doc.text(data.customer.phone, rightX, doc.y + 2);
    if (data.customer.email) doc.text(data.customer.email, rightX, doc.y + 2);
    doc.text(data.customer.address, rightX, doc.y + 2, { width: 220 });

    const metaY = 230;
    doc.fillColor('#111827').font('Arial-Bold').fontSize(10).text('Detalii', 48, metaY);
    doc.font('Arial').fontSize(9).fillColor('#374151');
    doc.text(`Data: ${formatDate(data.createdAt)}`, 48, metaY + 18);
    doc.text(`Status: ${data.status}`, 48, doc.y + 4);
    if (data.validUntil) doc.text(`Valabil până: ${formatDate(data.validUntil)}`, 48, doc.y + 4);

    const drawTableHeader = (top: number): number => {
      doc.rect(48, top, doc.page.width - 96, 28).fill('#F5F3FF');
      doc.fillColor('#4C1D95').font('Arial-Bold').fontSize(9);
      doc.text('Descriere', 56, top + 9);
      doc.text('Cant.', 320, top + 9);
      doc.text('Preț unit.', 370, top + 9);
      doc.text('Total', 470, top + 9, { width: 70, align: 'right' });
      return top + 36;
    };

    const pageBottom = doc.page.height - 60;
    let rowY = drawTableHeader(doc.y + 24);
    doc.font('Arial').fontSize(9).fillColor('#374151');
    for (const line of data.lines) {
      const rowHeight = Math.max(doc.heightOfString(line.description, { width: 250 }), 12) + 10;
      if (rowY + rowHeight > pageBottom) {
        doc.addPage();
        rowY = drawTableHeader(48);
        doc.font('Arial').fontSize(9).fillColor('#374151');
      }
      const lineTotal = Number(line.qty) * Number(line.unitPrice);
      doc.text(line.description, 56, rowY, { width: 250 });
      doc.text(String(Number(line.qty)), 320, rowY);
      doc.text(formatMoney(Number(line.unitPrice)), 370, rowY);
      doc.text(formatMoney(lineTotal), 470, rowY, { width: 70, align: 'right' });
      rowY += rowHeight;
    }
    if (rowY + 90 > doc.page.height - 48) {
      doc.addPage();
      rowY = 48;
    }
    doc.moveTo(48, rowY + 8).lineTo(doc.page.width - 48, rowY + 8).stroke('#E5E7EB');
    const tva =
      Math.round(
        data.lines.reduce(
          (acc, line) =>
            acc + Number(line.qty) * Number(line.unitPrice) * (Number(line.vatRate ?? 0) / 100),
          0,
        ) * 100,
      ) / 100;

    if (tva > 0) {
      doc.fillColor('#374151').font('Arial').fontSize(9);
      doc.text(`Subtotal (fără TVA): ${formatMoney(total)}`, 370, rowY + 20, { width: 170, align: 'right' });
      doc.text(`TVA: ${formatMoney(tva)}`, 370, doc.y + 4, { width: 170, align: 'right' });
      doc.fillColor('#111827').font('Arial-Bold').fontSize(11);
      doc.text(`TOTAL DE PLATĂ: ${formatMoney(total + tva)}`, 370, doc.y + 6, { width: 170, align: 'right' });
    } else {
      doc.fillColor('#111827').font('Arial-Bold').fontSize(11);
      doc.text(`TOTAL: ${formatMoney(total)}`, 370, rowY + 20, { width: 170, align: 'right' });
    }

    doc.end();
    return await finished;
  }
}

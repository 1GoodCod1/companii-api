import { Injectable } from '@nestjs/common';
import path from 'path';
import PDFDocument from 'pdfkit';
import type {
  Category,
  Company,
  CompanyCustomer,
  EstimateLine,
  EstimateProject,
  EstimateStage,
} from '@prisma/client';

import { formatDate, formatMoney } from './pdf-format.util';

type EstimatePdfData = EstimateProject & {
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
  category: Pick<Category, 'name'>;
  stages: Array<EstimateStage & { lines: EstimateLine[] }>;
};

@Injectable()
export class EstimatePdfService {
  async build(data: EstimatePdfData): Promise<Buffer> {
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

    doc.rect(0, 0, doc.page.width, 120).fill('#059669');
    doc.fillColor('#FFFFFF').fontSize(22).font('Arial-Bold').text('SMETĂ / DEVIZ', 48, 42);
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
    doc.fillColor('#111827').font('Arial-Bold').fontSize(10).text('Detalii proiect', 48, metaY);
    doc.font('Arial').fontSize(9).fillColor('#374151');
    doc.text(`Titlu: ${data.title}`, 48, metaY + 18);
    doc.text(`Categorie: ${data.category.name}`, 48, doc.y + 4);
    doc.text(`Data: ${formatDate(data.createdAt)}`, 48, doc.y + 4);
    doc.text(`Status: ${data.status}`, 48, doc.y + 4);
    if (data.validUntil) doc.text(`Valabil până: ${formatDate(data.validUntil)}`, 48, doc.y + 4);
    if (data.address) doc.text(`Adresă: ${data.address}`, 48, doc.y + 4, { width: 500 });

    let rowY = doc.y + 24;

    for (const stage of data.stages) {
      doc.fillColor('#065F46').font('Arial-Bold').fontSize(10).text(stage.name, 48, rowY);
      rowY += 16;

      if (stage.lines.length) {
        doc.rect(48, rowY, doc.page.width - 96, 24).fill('#ECFDF5');
        doc.fillColor('#065F46').font('Arial-Bold').fontSize(8);
        doc.text('Descriere', 56, rowY + 8);
        doc.text('Cant.', 300, rowY + 8);
        doc.text('Preț unit.', 350, rowY + 8);
        doc.text('Total', 470, rowY + 8, { width: 70, align: 'right' });
        rowY += 30;

        doc.font('Arial').fontSize(8).fillColor('#374151');
        for (const line of stage.lines) {
          if (rowY > doc.page.height - 80) {
            doc.addPage();
            rowY = 48;
          }
          const lineTotal = Number(line.lineTotal ?? Number(line.qty) * Number(line.unitPrice));
          doc.text(line.description, 56, rowY, { width: 230 });
          doc.text(String(Number(line.qty)), 300, rowY);
          doc.text(formatMoney(Number(line.unitPrice)), 350, rowY);
          doc.text(formatMoney(lineTotal), 470, rowY, { width: 70, align: 'right' });
          rowY += 18;
        }
      } else {
        doc.font('Arial').fontSize(8).fillColor('#6B7280');
        doc.text(`Total etapă: ${formatMoney(Number(stage.stageTotal))}`, 56, rowY);
        rowY += 16;
      }

      rowY += 8;
    }

    doc.moveTo(48, rowY + 4).lineTo(doc.page.width - 48, rowY + 4).stroke('#E5E7EB');
    doc.fillColor('#111827').font('Arial').fontSize(9);
    doc.text(`Manoperă: ${formatMoney(Number(data.laborTotal))}`, 48, rowY + 16);
    doc.text(`Materiale: ${formatMoney(Number(data.materialTotal))}`, 48, doc.y + 4);
    doc.text(`Marjă: ${Number(data.marginPct)}%`, 48, doc.y + 4);
    doc.font('Arial-Bold').fontSize(11);
    doc.text(`TOTAL: ${formatMoney(Number(data.grandTotal))}`, 370, rowY + 16, {
      width: 170,
      align: 'right',
    });

    doc.end();
    return finished;
  }
}

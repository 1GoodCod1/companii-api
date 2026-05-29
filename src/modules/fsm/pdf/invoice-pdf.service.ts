import { Injectable } from '@nestjs/common';
import path from 'path';
import PDFDocument from 'pdfkit';
import type { Company, CompanyCustomer, CompanyInvoice, Intervention } from '@prisma/client';

import { formatDate, formatMoney, paymentStatusRoLabel } from './pdf-format.util';

type InvoicePdfData = CompanyInvoice & {
  company: Pick<Company, 'name' | 'legalName' | 'idno' | 'legalAddress' | 'contactPhone' | 'contactEmail' | 'isTvaPayer' | 'tvaCode'>;
  intervention: (Intervention & { customer: CompanyCustomer }) | null;
};

@Injectable()
export class InvoicePdfService {
  async build(data: InvoicePdfData): Promise<Buffer> {
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

    const base = Number(data.amount);
    const tva = Number(data.tvaAmount);
    const total = base + tva;
    const customer = data.intervention?.customer;
    const intervention = data.intervention;

    // Header band. Factură = request to pay (UNPAID / OVERDUE).
    // Chitanță = proof of payment (PAID). Cancelled invoices render in red so
    // a returned PDF can't be mistaken for an active demand.
    const isCancelled = data.paymentStatus === 'CANCELLED';
    const docTitle = isCancelled
      ? 'FACTURĂ ANULATĂ'
      : data.paymentStatus === 'PAID'
        ? 'CHITANȚĂ'
        : 'FACTURĂ';
    const bandColor = isCancelled ? '#991B1B' : '#6D28D9';
    doc.rect(0, 0, doc.page.width, 120).fill(bandColor);
    doc.fillColor('#FFFFFF').fontSize(22).font('Arial-Bold').text(docTitle, 48, 42);
    doc.fontSize(11).font('Arial').text(data.company.name, 48, 72);
    doc.fontSize(10).text(`Nr. ${data.number}`, 48, 92);

    doc.fillColor('#111827').font('Arial-Bold').fontSize(10).text('EMITENT', 48, 140);
    doc.font('Arial').fontSize(9).fillColor('#374151');
    doc.text(data.company.legalName || data.company.name, 48, 156);
    if (data.company.idno) doc.text(`IDNO: ${data.company.idno}`, 48, doc.y + 2);
    if (data.company.legalAddress) doc.text(data.company.legalAddress, 48, doc.y + 2);
    if (data.company.contactPhone) doc.text(`Tel: ${data.company.contactPhone}`, 48, doc.y + 2);
    if (data.company.isTvaPayer && data.company.tvaCode) {
      doc.text(`TVA: ${data.company.tvaCode}`, 48, doc.y + 2);
    }

    const rightX = 320;
    doc.fillColor('#111827').font('Arial-Bold').fontSize(10).text('CLIENT', rightX, 140);
    doc.font('Arial').fontSize(9).fillColor('#374151');
    if (customer) {
      doc.text(customer.fullName, rightX, 156);
      doc.text(customer.phone, rightX, doc.y + 2);
      if (customer.email) doc.text(customer.email, rightX, doc.y + 2);
      doc.text(customer.address, rightX, doc.y + 2, { width: 220 });
    }

    doc.moveDown(2);
    const metaY = doc.y + 8;
    doc.fillColor('#111827').font('Arial-Bold').fontSize(10).text('Detalii document', 48, metaY);
    doc.font('Arial').fontSize(9).fillColor('#374151');
    doc.text(`Data emiterii: ${formatDate(data.issuedAt)}`, 48, metaY + 18);
    if (data.dueDate) doc.text(`Scadență: ${formatDate(data.dueDate)}`, 48, doc.y + 4);
    doc.text(`Status plată: ${paymentStatusRoLabel(data.paymentStatus)}`, 48, doc.y + 4);
    if (intervention) {
      doc.text(`Lucrare: ${intervention.number} — ${intervention.type}`, 48, doc.y + 4);
    }

    const tableTop = doc.y + 24;
    doc.rect(48, tableTop, doc.page.width - 96, 28).fill('#F5F3FF');
    doc.fillColor('#4C1D95').font('Arial-Bold').fontSize(9);
    doc.text('Descriere', 56, tableTop + 9);
    doc.text('Sumă', 420, tableTop + 9, { width: 100, align: 'right' });

    const rowY = tableTop + 36;
    const description = intervention
      ? `Servicii ${intervention.type} (${intervention.number})`
      : 'Servicii prestate';
    doc.fillColor('#111827').font('Arial').fontSize(9);
    doc.text(description, 56, rowY, { width: 340 });
    doc.text(formatMoney(base), 420, rowY, { width: 100, align: 'right' });

    const totalsY = rowY + 48;
    doc.font('Arial').fillColor('#374151');
    
    if (data.tvaRate !== null && Number(data.tvaRate) > 0) {
      doc.text('Bază impozabilă:', 320, totalsY);
      doc.text(formatMoney(base), 420, totalsY, { width: 100, align: 'right' });
      doc.text(`TVA (${Number(data.tvaRate)}%):`, 320, totalsY + 16);
      doc.text(formatMoney(tva), 420, totalsY + 16, { width: 100, align: 'right' });
      
      doc.rect(48, totalsY + 36, doc.page.width - 96, 32).fill('#EDE9FE');
      doc.fillColor('#5B21B6').font('Arial-Bold').fontSize(11);
      doc.text('TOTAL DE PLATĂ', 56, totalsY + 46);
      doc.text(formatMoney(total), 420, totalsY + 46, { width: 100, align: 'right' });
    } else {
      doc.text('Preț total (fără TVA):', 320, totalsY);
      doc.text(formatMoney(base), 420, totalsY, { width: 100, align: 'right' });
      doc.fontSize(8).fillColor('#6B7280');
      doc.text('Compania nu este înregistrată ca plătitor TVA (Codul fiscal art. 112)', 48, totalsY + 16, { width: 250 });
      
      doc.rect(48, totalsY + 36, doc.page.width - 96, 32).fill('#EDE9FE');
      doc.fillColor('#5B21B6').font('Arial-Bold').fontSize(11);
      doc.text('TOTAL DE PLATĂ', 56, totalsY + 46);
      doc.text(formatMoney(base), 420, totalsY + 46, { width: 100, align: 'right' });
    }

    doc.fillColor('#6B7280').font('Arial').fontSize(8);
    doc.text(
      'Document generat electronic prin Faber Companii. Acest document servește ca dovadă fiscală simplificată.',
      48,
      doc.page.height - 72,
      { width: doc.page.width - 96, align: 'center' },
    );

    // Cancellation overlay — appears LAST so it sits on top of everything.
    if (isCancelled) {
      doc.save();
      doc.fillColor('#DC2626').font('Arial-Bold').fontSize(72);
      doc.rotate(-22, { origin: [doc.page.width / 2, doc.page.height / 2] });
      doc.text(
        'ANULATĂ',
        0,
        doc.page.height / 2 - 36,
        { width: doc.page.width, align: 'center' },
      );
      doc.restore();
      if (data.cancellationReason) {
        doc.fillColor('#7F1D1D').font('Arial').fontSize(9);
        doc.text(
          `Motiv anulare: ${data.cancellationReason}`,
          48,
          doc.page.height - 96,
          { width: doc.page.width - 96, align: 'center' },
        );
      }
    }

    doc.end();
    return finished;
  }
}

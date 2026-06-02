import { Injectable } from '@nestjs/common';
import path from 'path';
import { Readable } from 'stream';
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

type PdfLocale = 'ro' | 'ru';

interface EstimatePdfOptions {
  isClientView?: boolean;
  locale?: PdfLocale;
  watermarkText?: string;
}

const STATUS_WATERMARK: Record<string, string | undefined> = {
  DRAFT: 'DRAFT',
  MEASURED: 'DRAFT',
  CALCULATED: 'DRAFT',
  APPROVED: undefined,
  SENT: undefined,
  ACCEPTED: 'FINAL',
  IN_EXECUTION: 'FINAL',
  DONE: 'FINAL',
  CANCELLED: 'EXPIRED',
};

type PdfStage = EstimateStage & { lines: EstimateLine[] };

export function filterStagesForPdf(stages: PdfStage[]): PdfStage[] {
  return stages.filter((stage) => {
    const lines = stage.lines ?? [];
    if (lines.length > 0) return true;
    return Number(stage.stageTotal ?? 0) > 0;
  });
}

const STATUS_LABELS: Record<string, { ro: string; ru: string }> = {
  DRAFT: { ro: 'Ciornă', ru: 'Черновик' },
  MEASURED: { ro: 'Măsurători', ru: 'Замеры' },
  CALCULATED: { ro: 'Calculată', ru: 'Рассчитано' },
  APPROVED: { ro: 'Aprobată', ru: 'Одобрено' },
  SENT: { ro: 'Trimisă', ru: 'Отправлено' },
  ACCEPTED: { ro: 'Acceptată', ru: 'Принято' },
  IN_EXECUTION: { ro: 'În execuție', ru: 'В исполнении' },
  DONE: { ro: 'Finalizată', ru: 'Завершено' },
  CANCELLED: { ro: 'Anulată', ru: 'Отменено' },
};

const I18N = {
  title: { ro: 'SMETĂ / DEVIZ', ru: 'СМЕТА / ДЕВИЗ' },
  emitter: { ro: 'EMITENT', ru: 'ОТПРАВИТЕЛЬ' },
  client: { ro: 'CLIENT', ru: 'КЛИЕНТ' },
  projectDetails: { ro: 'Detalii proiect', ru: 'Детали проекта' },
  projectTitle: { ro: 'Titlu', ru: 'Название' },
  category: { ro: 'Categorie', ru: 'Категория' },
  date: { ro: 'Data', ru: 'Дата' },
  status: { ro: 'Status', ru: 'Статус' },
  validUntil: { ro: 'Valabil până', ru: 'Действителен до' },
  address: { ro: 'Adresă', ru: 'Адрес' },
  descriere: { ro: 'Descriere', ru: 'Описание' },
  cant: { ro: 'Cant.', ru: 'Кол.' },
  pretUnit: { ro: 'Preț unit.', ru: 'Цена ед.' },
  total: { ro: 'Total', ru: 'Итого' },
  totalEtapa: { ro: 'Total etapă', ru: 'Итого по этапу' },
  manopera: { ro: 'Cost Lucrări', ru: 'Стоимость Работ' },
  materiale: { ro: 'Materiale', ru: 'Материалы' },
  marja: { ro: 'Marjă', ru: 'Наценка' },
  subtotalFaraTva: { ro: 'Subtotal fără TVA', ru: 'Подытог без НДС' },
  tva: { ro: 'TVA', ru: 'НДС' },
  faraTva: { ro: 'Fără TVA', ru: 'Без НДС' },
  totalCuTva: { ro: 'Total cu TVA', ru: 'Итого с НДС' },
  nonTvaDisclaimer: {
    ro: 'Compania nu este înregistrată ca plătitor TVA (Codul fiscal art. 112)',
    ru: 'Компания не зарегистрирована как плательщик НДС (Налоговый кодекс ст. 112)',
  },
  tel: { ro: 'Tel', ru: 'Тел' },
  codTva: { ro: 'Cod TVA', ru: 'Код НДС' },
  nr: { ro: 'Nr.', ru: '№' },
} as const;

function t(key: keyof typeof I18N, locale: PdfLocale): string {
  return I18N[key][locale];
}

@Injectable()
export class EstimatePdfService {
  async build(data: EstimatePdfData, options?: EstimatePdfOptions): Promise<Buffer> {
    const locale: PdfLocale = options?.locale ?? 'ro';
    const isClientView = options?.isClientView ?? false;
    const watermarkText = options?.watermarkText ?? STATUS_WATERMARK[data.status];

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

    // --- Green header ---
    doc.rect(0, 0, doc.page.width, 120).fill('#059669');
    doc.fillColor('#FFFFFF').fontSize(22).font('Arial-Bold').text(t('title', locale), 48, 42);
    doc.fontSize(11).font('Arial').text(data.company.name, 48, 72);
    doc.fontSize(10).text(`${t('nr', locale)} ${data.number}`, 48, 92);

    // --- Emitter block ---
    doc.fillColor('#111827').font('Arial-Bold').fontSize(10).text(t('emitter', locale), 48, 140);
    doc.font('Arial').fontSize(9).fillColor('#374151');
    doc.text(data.company.legalName || data.company.name, 48, 156);
    if (data.company.idno) doc.text(`IDNO: ${data.company.idno}`, 48, doc.y + 2);
    if (data.company.legalAddress) doc.text(data.company.legalAddress, 48, doc.y + 2);
    if (data.company.contactPhone)
      doc.text(`${t('tel', locale)}: ${data.company.contactPhone}`, 48, doc.y + 2);
    if (data.company.isTvaPayer && data.company.tvaCode) {
      doc.text(`${t('codTva', locale)}: ${data.company.tvaCode}`, 48, doc.y + 2);
    }

    // --- Client block ---
    const rightX = 320;
    doc.fillColor('#111827').font('Arial-Bold').fontSize(10).text(t('client', locale), rightX, 140);
    doc.font('Arial').fontSize(9).fillColor('#374151');
    doc.text(data.customer.fullName, rightX, 156);
    doc.text(data.customer.phone, rightX, doc.y + 2);
    if (data.customer.email) doc.text(data.customer.email, rightX, doc.y + 2);
    doc.text(data.customer.address, rightX, doc.y + 2, { width: 220 });

    // --- Project details ---
    const metaY = 230;
    doc.fillColor('#111827').font('Arial-Bold').fontSize(10).text(t('projectDetails', locale), 48, metaY);
    doc.font('Arial').fontSize(9).fillColor('#374151');
    doc.text(`${t('projectTitle', locale)}: ${data.title}`, 48, metaY + 18);
    doc.text(`${t('category', locale)}: ${data.category.name}`, 48, doc.y + 4);
    doc.text(`${t('date', locale)}: ${formatDate(data.createdAt)}`, 48, doc.y + 4);
    const statusLabel =
      STATUS_LABELS[data.status]?.[locale] ?? data.status;
    doc.text(`${t('status', locale)}: ${statusLabel}`, 48, doc.y + 4);
    if (data.validUntil)
      doc.text(`${t('validUntil', locale)}: ${formatDate(data.validUntil)}`, 48, doc.y + 4);
    if (data.address)
      doc.text(`${t('address', locale)}: ${data.address}`, 48, doc.y + 4, { width: 500 });

    let rowY = doc.y + 24;

    const pdfStages = filterStagesForPdf(data.stages);

    // --- Stages ---
    for (const stage of pdfStages) {
      doc.fillColor('#065F46').font('Arial-Bold').fontSize(10).text(stage.name, 48, rowY);
      rowY += 16;

      if (stage.lines.length) {
        // Table header
        doc.rect(48, rowY, doc.page.width - 96, 24).fill('#ECFDF5');
        doc.fillColor('#065F46').font('Arial-Bold').fontSize(8);
        doc.text(t('descriere', locale), 56, rowY + 8);
        doc.text(t('cant', locale), 300, rowY + 8);
        doc.text(t('pretUnit', locale), 350, rowY + 8);
        doc.text(t('total', locale), 470, rowY + 8, { width: 70, align: 'right' });
        rowY += 30;

        doc.font('Arial').fontSize(8).fillColor('#374151');
        for (const line of stage.lines) {
          if (rowY > doc.page.height - 80) {
            doc.addPage();
            this.drawWatermark(doc, watermarkText);
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
        doc.text(
          `${t('totalEtapa', locale)}: ${formatMoney(Number(stage.stageTotal))}`,
          56,
          rowY,
        );
        rowY += 16;
      }

      rowY += 8;
    }

    // --- Totals ---
    doc.moveTo(48, rowY + 4).lineTo(doc.page.width - 48, rowY + 4).stroke('#E5E7EB');
    doc.fillColor('#111827');

    const round2 = (n: number) => Math.round(n * 100) / 100;
    let totalsY = rowY + 16;
    if (!isClientView) {
      doc.font('Arial').fontSize(9);
      doc.text(
        `${t('manopera', locale)}: ${formatMoney(Number(data.laborTotal))}`,
        48,
        totalsY,
      );
      doc.text(
        `${t('materiale', locale)}: ${formatMoney(Number(data.materialTotal))}`,
        48,
        doc.y + 4,
      );
      doc.text(`${t('marja', locale)}: ${Number(data.marginPct)}%`, 48, doc.y + 4);
    }

    doc.font('Arial').fontSize(9);
    if (data.company.isTvaPayer) {
      doc.text(
        `${t('subtotalFaraTva', locale)}: ${formatMoney(Number(data.grandTotal))}`,
        370,
        totalsY,
        { width: 170, align: 'right' },
      );
      totalsY += 14;
      const marginFactor = 1 + Number(data.marginPct) / 100;
      const vatGrouped = new Map<number, number>();
      const lines: EstimateLine[] = [];
      for (const stage of pdfStages) {
        if (stage.lines) lines.push(...stage.lines);
      }
      for (const line of lines) {
        const rate =
          line.vatRate !== null && line.vatRate !== undefined
            ? Number(line.vatRate)
            : Number(data.tvaRate ?? 20);
        const lineTotal = Number(line.lineTotal);
        const lineTva = lineTotal * marginFactor * (rate / 100);
        vatGrouped.set(rate, (vatGrouped.get(rate) || 0) + lineTva);
      }

      const sortedRates = Array.from(vatGrouped.keys()).sort((a, b) => b - a);
      for (const rate of sortedRates) {
        const vatAmount = round2(vatGrouped.get(rate) ?? 0);
        if (rate > 0) {
          doc.text(
            `${t('tva', locale)} ${rate}%: ${formatMoney(vatAmount)}`,
            370,
            totalsY,
            { width: 170, align: 'right' },
          );
        } else {
          doc.text(`${t('faraTva', locale)}: ${formatMoney(0)}`, 370, totalsY, {
            width: 170,
            align: 'right',
          });
        }
        totalsY += 14;
      }

      doc.font('Arial-Bold').fontSize(11);
      doc.text(
        `${t('totalCuTva', locale)}: ${formatMoney(Number(data.grandTotalWithVat))}`,
        370,
        totalsY,
        { width: 170, align: 'right' },
      );
    } else {
      doc.font('Arial-Bold').fontSize(11);
      doc.text(
        `${t('total', locale)}: ${formatMoney(Number(data.grandTotal))}`,
        370,
        totalsY,
        { width: 170, align: 'right' },
      );
      totalsY += 16;
      doc.font('Arial').fontSize(8).fillColor('#6B7280');
      doc.text(t('nonTvaDisclaimer', locale), 320, totalsY, {
        width: 220,
        align: 'right',
      });
    }

    // --- Watermark on first page ---
    this.drawWatermark(doc, watermarkText);

    doc.end();
    return await finished;
  }

  private drawWatermark(doc: PDFKit.PDFDocument, text?: string) {
    if (!text) return;
    const pageW = doc.page.width;
    const pageH = doc.page.height;
    doc.save();
    doc.rotate(45, { origin: [pageW / 2, pageH / 2] });
    doc.font('Arial-Bold').fontSize(72).fillColor('#000000').opacity(0.04);
    const textWidth = doc.widthOfString(text);
    doc.text(text, pageW / 2 - textWidth / 2, pageH / 2 - 36);
    doc.opacity(1);
    doc.restore();
  }

  async buildShoppingListPdf(
    project: any,
    grouped: Record<string, any[]>,
    isMember: boolean,
  ): Promise<Buffer> {
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

    // Header header
    doc.rect(0, 0, doc.page.width, 120).fill('#0284C7'); // Sleek blue color for shopping list
    doc.fillColor('#FFFFFF').fontSize(20).font('Arial-Bold').text('LISTĂ DE CUMPĂRĂTURI', 48, 38);
    doc.fontSize(12).font('Arial-Bold').text('SHOPPING LIST', 48, 62);
    doc.fontSize(10).font('Arial').text(`Nr. ${project.number} — ${project.title}`, 48, 88);

    // Project metadata
    doc.fillColor('#111827').font('Arial-Bold').fontSize(10).text('DETALII PROIECT', 48, 140);
    doc.font('Arial').fontSize(9).fillColor('#374151');
    doc.text(`Client: ${project.customer?.fullName || 'N/A'}`, 48, 156);
    if (project.customer?.phone) doc.text(`Tel: ${project.customer.phone}`, 48, doc.y + 2);
    if (project.address) doc.text(`Adresă: ${project.address}`, 48, doc.y + 2, { width: 500 });
    doc.text(`Data generării: ${formatDate(new Date())}`, 48, doc.y + 2);

    let rowY = doc.y + 24;

    const stores = Object.keys(grouped).sort();
    for (const store of stores) {
      const lines = grouped[store];
      if (!lines.length) continue;

      if (rowY > doc.page.height - 100) {
        doc.addPage();
        rowY = 48;
      }

      doc.fillColor('#0369A1').font('Arial-Bold').fontSize(11).text(store === 'unassigned' ? 'Altele / Nespecificat' : store, 48, rowY);
      rowY += 16;

      doc.rect(48, rowY, doc.page.width - 96, 20).fill('#F0F9FF');
      doc.fillColor('#0369A1').font('Arial-Bold').fontSize(8);
      doc.text('Articol / Descriere', 56, rowY + 6);
      doc.text('Cantitate', 320, rowY + 6);
      doc.text('Unitate', 380, rowY + 6);
      if (!isMember) {
        doc.text('Preț estimat', 440, rowY + 6, { width: 80, align: 'right' });
      }
      rowY += 26;

      doc.font('Arial').fontSize(8).fillColor('#374151');
      for (const line of lines) {
        if (rowY > doc.page.height - 80) {
          doc.addPage();
          rowY = 48;
          // Redraw table headers on new page
          doc.rect(48, rowY, doc.page.width - 96, 20).fill('#F0F9FF');
          doc.fillColor('#0369A1').font('Arial-Bold').fontSize(8);
          doc.text('Articol / Descriere', 56, rowY + 6);
          doc.text('Cantitate', 320, rowY + 6);
          doc.text('Unitate', 380, rowY + 6);
          if (!isMember) {
            doc.text('Preț estimat', 440, rowY + 6, { width: 80, align: 'right' });
          }
          rowY += 26;
          doc.font('Arial').fontSize(8).fillColor('#374151');
        }

        doc.text(line.description, 56, rowY, { width: 250 });
        doc.text(String(line.qty), 320, rowY);
        doc.text(line.unit, 380, rowY);
        if (!isMember && line.estimatedUnitPrice !== undefined) {
          doc.text(formatMoney(line.estimatedUnitPrice), 440, rowY, { width: 80, align: 'right' });
        }
        rowY += 18;
      }

      rowY += 12;
    }

    doc.end();
    return await finished;
  }

  async buildShoppingListStream(
    project: any,
    grouped: Record<string, any[]>,
    isMember: boolean,
  ): Promise<Readable> {
    const buffer = await this.buildShoppingListPdf(project, grouped, isMember);
    return Readable.from(buffer);
  }

  async buildStream(
    data: EstimatePdfData,
    options?: EstimatePdfOptions,
  ): Promise<Readable> {
    const buffer = await this.build(data, options);
    return Readable.from(buffer);
  }
}
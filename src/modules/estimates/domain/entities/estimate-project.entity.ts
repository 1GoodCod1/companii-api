import { EstimateProjectStatus } from '@prisma/client';
import { EstimateStatusStateMachine } from '../state-machine/estimate-status.state-machine';
import { round2 } from '../../estimate.constants';
import { isEstimateLaborLine } from '../../utils/calculation/estimate-line-recalculate.util';

export interface EstimateStage {
  id: string;
  code: string;
  name: string;
  kind: string;
  sortOrder: number;
  laborCost: number;
  materialCost: number;
  stageTotal: number;
  laborHours: number | null;
  laborRate: number | null;
  durationDays: number | null;
  description: string;
  checklist: string[];
  lines: EstimateLine[];
}

export interface EstimateLine {
  id: string;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  lineTotal: number;
  source: string;
  sortOrder: number;
  materialStore: string | null;
  receiptFileKey: string | null;
  actualUnitPrice: number | null;
  actualQty: number | null;
  actualLineTotal: number | null;
  actualNotes: string | null;
  actualStatus: string | null;
  receiptId: string | null;
  vatRate: number | null;
  kind?: 'labor' | 'material';
}

export interface EstimateProjectProps {
  id: string;
  companyId: string;
  customerId: string;
  categoryId: string;
  blueprintId: string;
  number: string;
  title: string;
  status: EstimateProjectStatus;
  siteType: string | null;
  address: string | null;
  marginPct: number;
  riskReservePct: number;
  tvaRate: number;
  laborTotal: number;
  materialTotal: number;
  grandTotal: number;
  tvaAmount: number;
  grandTotalWithVat: number;
  actualsLockedAt: Date | null;
  version: number;
  stages: EstimateStage[];
  validUntil: Date | null;
  quoteId: string | null;
  isTvaPayer: boolean;
  notes: string | null;
}

export class EstimateProject {
  readonly id: string;
  readonly companyId: string;
  readonly customerId: string;
  readonly categoryId: string;
  readonly blueprintId: string;
  readonly number: string;
  readonly title: string;
  readonly status: EstimateProjectStatus;
  readonly siteType: string | null;
  readonly address: string | null;
  readonly marginPct: number;
  readonly riskReservePct: number;
  readonly tvaRate: number;
  readonly laborTotal: number;
  readonly materialTotal: number;
  readonly grandTotal: number;
  readonly tvaAmount: number;
  readonly grandTotalWithVat: number;
  readonly actualsLockedAt: Date | null;
  readonly version: number;
  readonly stages: EstimateStage[];
  readonly validUntil: Date | null;
  readonly quoteId: string | null;
  readonly isTvaPayer: boolean;
  readonly notes: string | null;

  constructor(props: EstimateProjectProps) {
    this.id = props.id;
    this.companyId = props.companyId;
    this.customerId = props.customerId;
    this.categoryId = props.categoryId;
    this.blueprintId = props.blueprintId;
    this.number = props.number;
    this.title = props.title;
    this.status = props.status;
    this.siteType = props.siteType;
    this.address = props.address;
    this.marginPct = props.marginPct;
    this.riskReservePct = props.riskReservePct;
    this.tvaRate = props.tvaRate;
    this.laborTotal = props.laborTotal;
    this.materialTotal = props.materialTotal;
    this.grandTotal = props.grandTotal;
    this.tvaAmount = props.tvaAmount;
    this.grandTotalWithVat = props.grandTotalWithVat;
    this.actualsLockedAt = props.actualsLockedAt;
    this.version = props.version;
    this.stages = props.stages;
    this.validUntil = props.validUntil;
    this.quoteId = props.quoteId;
    this.isTvaPayer = props.isTvaPayer;
    this.notes = props.notes;
  }

  canBeDeleted(): boolean {
    return this.status !== 'IN_EXECUTION' && this.status !== 'DONE';
  }

  canBeCalculated(): boolean {
    const recalculable: EstimateProjectStatus[] = ['DRAFT', 'MEASURED', 'CALCULATED', 'APPROVED'];
    return recalculable.includes(this.status);
  }

  canBeSent(): boolean {
    return (
      this.status === 'CALCULATED' ||
      this.status === 'APPROVED' ||
      this.status === 'SENT'
    );
  }

  canBeConverted(): boolean {
    return this.status === 'ACCEPTED';
  }

  canAcceptReceipts(): boolean {
    const allowed: EstimateProjectStatus[] = [
      'CALCULATED',
      'APPROVED',
      'SENT',
      'ACCEPTED',
      'IN_EXECUTION',
      'DONE',
    ];
    return allowed.includes(this.status);
  }

  isActualsLocked(): boolean {
    return this.actualsLockedAt !== null;
  }

  getSubtotal(): number {
    return this.laborTotal + this.materialTotal;
  }

  getMaterialLines(): EstimateLine[] {
    const lines: EstimateLine[] = [];
    for (const stage of this.stages) {
      for (const line of stage.lines) {
        if (!isEstimateLaborLine({
          unit: line.unit,
          description: line.description,
          stageKind: stage.kind,
        })) {
          lines.push(line);
        }
      }
    }
    return lines;
  }

  recalculateProjectTotals(stages: EstimateStage[]): {
    laborTotal: number;
    materialTotal: number;
    grandTotal: number;
    tvaAmount: number;
    grandTotalWithVat: number;
  } {
    const laborTotal = round2(stages.reduce((acc, s) => acc + s.laborCost, 0));
    const materialTotal = round2(stages.reduce((acc, s) => acc + s.materialCost, 0));
    const subtotal = laborTotal + materialTotal;
    const grandTotal = round2(subtotal * (1 + (this.riskReservePct ?? 0) / 100) * (1 + this.marginPct / 100));

    const allProjectLines = stages.flatMap((s) => s.lines);
    const priceFactor = (1 + (this.riskReservePct ?? 0) / 100) * (1 + this.marginPct / 100);
    let tvaAmount = 0;
    for (const line of allProjectLines) {
      const rate = line.vatRate !== null && line.vatRate !== undefined ? line.vatRate : this.tvaRate;
      tvaAmount += line.lineTotal * priceFactor * (rate / 100);
    }
    tvaAmount = round2(tvaAmount);
    const grandTotalWithVat = round2(grandTotal + tvaAmount);

    return { laborTotal, materialTotal, grandTotal, tvaAmount, grandTotalWithVat };
  }

  assertCanTransition(newStatus: EstimateProjectStatus): void {
    EstimateStatusStateMachine.assertTransition(this.status, newStatus);
  }
}
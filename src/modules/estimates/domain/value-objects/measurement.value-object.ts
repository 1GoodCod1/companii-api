import type { EstimateMeasurementUnit } from '../../../../../prisma/estimate-measurement-units';

export class Measurement {
  readonly key: string;
  readonly value: number;
  readonly unit: EstimateMeasurementUnit;

  constructor(key: string, value: number, unit: EstimateMeasurementUnit) {
    this.key = key;
    this.value = round2(value);
    this.unit = unit;
  }

  static fromRecord(key: string, value: number, guessUnit: (key: string) => EstimateMeasurementUnit): Measurement {
    return new Measurement(key, value, guessUnit(key));
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
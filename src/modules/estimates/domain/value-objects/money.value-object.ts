import { round2 } from '../../estimate.constants';

export class Money {
  private readonly amount: number;

  private constructor(amount: number) {
    this.amount = round2(amount);
  }

  static fromDecimal(value: unknown): Money {
    if (value === null || value === undefined) return new Money(0);
    return new Money(Number(value));
  }

  static fromNumber(value: number): Money {
    return new Money(value);
  }

  static zero(): Money {
    return new Money(0);
  }

  get value(): number {
    return this.amount;
  }

  add(other: Money): Money {
    return new Money(this.amount + other.amount);
  }

  subtract(other: Money): Money {
    return new Money(this.amount - other.amount);
  }

  multiply(factor: number): Money {
    return new Money(this.amount * factor);
  }

  isGreaterThan(other: Money): boolean {
    return this.amount > other.amount;
  }

  format(): string {
    return `${this.amount.toFixed(2)} MDL`;
  }
}
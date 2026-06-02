import { Type } from 'class-transformer';
import { IsObject } from 'class-validator';

export class PricingModifiersMapDto {
  [key: string]: number | null;
}

export class UpdatePricingModifiersDto {
  @IsObject()
  @Type(() => PricingModifiersMapDto)
  modifiers!: Record<string, number | null>;
}

import { IsObject } from 'class-validator';

export class UpdatePricingModifiersDto {
  /**
   * Map of registry key → surcharge percent. `null` clears the override (back to
   * the registry default). Keys and ranges are validated in the service against
   * the pricing-modifier registry.
   */
  @IsObject()
  modifiers!: Record<string, number | null>;
}

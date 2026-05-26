import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Payload shape mirrors the `web-vitals` package's `Metric` interface
 * (CLS, INP, LCP, FCP, TTFB). All fields are validated server-side so a
 * stray payload from a misbehaving browser never reaches the logger.
 */
export class WebVitalDto {
  @IsString()
  @MaxLength(32)
  name!: string;

  @IsNumber()
  value!: number;

  @IsString()
  @MaxLength(32)
  rating!: string;

  @IsNumber()
  delta!: number;

  @IsString()
  @MaxLength(128)
  id!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  navigationType?: string;
}

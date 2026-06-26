import { IsDateString, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ClientServiceRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  /** Approximate work duration in minutes (up to 30 days); clamped server-side. */
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(43200)
  durationMinutes?: number;
}

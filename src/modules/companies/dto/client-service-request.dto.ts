import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class ClientServiceRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

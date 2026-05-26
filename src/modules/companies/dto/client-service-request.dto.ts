import { IsDateString, IsOptional, IsString } from 'class-validator';

export class ClientServiceRequestDto {
  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

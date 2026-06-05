import {
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CompanyLeadSource, CompanyLeadStatus } from '@prisma/client';

export class CreateLeadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  contactName!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(32)
  contactPhone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsEnum(CompanyLeadSource)
  source?: CompanyLeadSource;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class UpdateLeadDto {
  @IsOptional()
  @IsEnum(CompanyLeadStatus)
  status?: CompanyLeadStatus;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  scheduledAt?: string | null;
}

export class ConvertLeadDto {
  @IsIn(['customer', 'intervention', 'estimate'])
  mode!: 'customer' | 'intervention' | 'estimate';

  @IsOptional()
  @IsString()
  @MaxLength(64)
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}

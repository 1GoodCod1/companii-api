import {
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { EstimateProjectStatus } from '@prisma/client';
import type { Plan2dData } from '../pricing/plan2d.types';

export class CreateEstimateProjectDto {
  @IsString()
  @MaxLength(64)
  customerId!: string;

  @IsString()
  @MaxLength(64)
  categoryId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  siteType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  validUntil?: string;
}

export class UpdateEstimateProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  siteType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  validUntil?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  marginPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  riskReservePct?: number;

  @IsOptional()
  @IsInt()
  siteFloor?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  accessDifficulty?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  urgency?: string | null;

  @IsOptional()
  @IsObject()
  diagnosticAnswers?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;

  @IsOptional()
  @IsEnum(EstimateProjectStatus)
  status?: EstimateProjectStatus;

  @IsOptional()
  @IsInt()
  @Min(0)
  expectedVersion?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  clientMutationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  clientDraftId?: string;
}

export class SaveSitePlanDto {
  // plan2d is a rich geometry payload; we assert it is an object and leave its
  // (large, nested) shape intact — the handler interprets it.
  @IsObject()
  plan2d!: Plan2dData;

  @IsOptional()
  @IsInt()
  @Min(0)
  expectedVersion?: number;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  clientMutationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  clientDraftId?: string;
}

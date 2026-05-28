import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class TemplateLineDto {
  @IsString()
  description!: string;

  @IsNumber()
  qty!: number;

  @IsString()
  unit!: string;

  @IsNumber()
  unitPrice!: number;

  @IsOptional()
  @IsString()
  materialStore?: string | null;

  @IsOptional()
  @IsNumber()
  vatRate?: number | null;
}

export class TemplateStageDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsEnum(['LABOR', 'MATERIAL', 'MIXED'])
  kind?: 'LABOR' | 'MATERIAL' | 'MIXED';

  @IsOptional()
  @IsString()
  description?: string | null;

  @IsOptional()
  @IsNumber()
  laborHours?: number | null;

  @IsOptional()
  @IsNumber()
  laborRate?: number | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  checklist?: string[];

  @IsOptional()
  @IsNumber()
  durationDays?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateLineDto)
  lines?: TemplateLineDto[];
}

export class CreateTemplateDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateStageDto)
  stages?: TemplateStageDto[];
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateStageDto)
  stages?: TemplateStageDto[];
}

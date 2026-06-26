import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { InterventionStatus } from '@prisma/client';

export class CreateInterventionDto {
  @IsString()
  @MaxLength(64)
  customerId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  type!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  address!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  technicianId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  assigneeMemberIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  crewId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  scheduledAt?: string;

  @IsOptional()
  @IsNumber()
  @Min(15)
  @Max(43200)
  durationMinutes?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  internalNotes?: string;
}

export class UpdateInterventionDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  type?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  technicianId?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  assigneeMemberIds?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  crewId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  scheduledAt?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(15)
  @Max(43200)
  durationMinutes?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedPrice?: number | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  finalPrice?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  internalNotes?: string | null;
}

export class UpdateInterventionStatusDto {
  @IsEnum(InterventionStatus)
  status!: InterventionStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class CreateInterventionNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @IsBoolean()
  isInternal?: boolean;
}

export class AddInterventionPhotosDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  fileKeys!: string[];
}

export class UpdateChecklistDto {
  // Keys are checklist-item ids → done flags. A plain map; we at least assert it
  // is an object (not a string/array) so the handler gets a well-formed shape.
  @IsObject()
  progress!: Record<string, boolean>;
}

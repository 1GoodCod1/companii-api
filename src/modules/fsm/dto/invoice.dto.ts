import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { InvoicePaymentStatus } from '@prisma/client';

export class CreateInvoiceDto {
  @IsString()
  @MaxLength(64)
  interventionId!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  tvaRate?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  dueDate?: string;
}

export class UpdateInvoiceDto {
  @IsOptional()
  @IsEnum(InvoicePaymentStatus)
  paymentStatus?: InvoicePaymentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  dueDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  paymentReversalReason?: string;
}

export class CancelInvoiceDto {
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

export class RecordInvoicePaymentDto {
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class RejectInvoicePaymentDto {
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

export class SendInvoiceEmailDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  customMessage?: string;
}

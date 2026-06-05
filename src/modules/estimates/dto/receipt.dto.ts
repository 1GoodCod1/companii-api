import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReceiptLineUpdateDto {
  @IsString()
  @MaxLength(64)
  lineId!: string;

  @IsNumber()
  @Min(0)
  actualUnitPrice!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  actualQty?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  actualNotes?: string;
}

export class CreateReceiptDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  fileKey?: string | null;

  @IsString()
  @MaxLength(200)
  store!: string;

  @IsNumber()
  @Min(0)
  totalAmount!: number;

  @IsString()
  @MaxLength(40)
  purchaseDate!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiptLineUpdateDto)
  lineUpdates!: ReceiptLineUpdateDto[];
}

export class UpdateReceiptDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  fileKey?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  store?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  totalAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  purchaseDate?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiptLineUpdateDto)
  lineUpdates?: ReceiptLineUpdateDto[];
}

export class SetLinesActualStatusDto {
  @IsArray()
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  lineIds!: string[];

  @IsIn(['NO_RECEIPT', 'SKIPPED'])
  status!: 'NO_RECEIPT' | 'SKIPPED';
}

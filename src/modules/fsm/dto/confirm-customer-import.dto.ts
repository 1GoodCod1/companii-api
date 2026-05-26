import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CUSTOMER_IMPORT_MAX_ROWS } from '../customer-import/customer-import.constants';

export class CustomerImportConfirmRowDto {
  @IsIn(['create', 'update'])
  action!: 'create' | 'update';

  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsString()
  @MinLength(5)
  phone!: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsString()
  @MinLength(3)
  address!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsUUID()
  existingCustomerId?: string;
}

export class ConfirmCustomerImportDto {
  @IsArray()
  @ArrayMaxSize(CUSTOMER_IMPORT_MAX_ROWS)
  @ValidateNested({ each: true })
  @Type(() => CustomerImportConfirmRowDto)
  rows!: CustomerImportConfirmRowDto[];
}

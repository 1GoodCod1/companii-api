import { IsBoolean, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  name!: string;

  @IsString()
  legalName!: string;

  @Matches(/^\d{13}$/)
  idno!: string;

  @IsString()
  legalAddress!: string;

  @IsUUID()
  cityId!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsBoolean()
  isTvaPayer?: boolean;

  @IsOptional()
  @IsString()
  tvaCode?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  contactPhone?: string;

  @IsOptional()
  @IsString()
  contactEmail?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsBoolean()
  showPublicPhone?: boolean;

  @IsOptional()
  @IsBoolean()
  showPublicEmail?: boolean;
}

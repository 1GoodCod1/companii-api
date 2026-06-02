import { Type } from 'class-transformer';
import { IsObject, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class CatalogTranslationPayloadDto {
  @IsOptional()
  @IsString()
  name?: string;
}

export class CreateAdminCityDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug?: string;

  @IsOptional()
  @IsObject()
  @Type(() => CatalogTranslationPayloadDto)
  translations?: Record<string, CatalogTranslationPayloadDto>;
}

export class UpdateAdminCityDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug?: string;

  @IsOptional()
  @IsObject()
  @Type(() => CatalogTranslationPayloadDto)
  translations?: Record<string, CatalogTranslationPayloadDto>;
}

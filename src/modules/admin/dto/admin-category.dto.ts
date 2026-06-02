import { Type } from 'class-transformer';
import { IsObject, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { CatalogTranslationPayloadDto } from './admin-city.dto';

export type { CatalogTranslationPayloadDto as CatalogTranslationPayload };

export class CreateAdminCategoryDto {
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

export class UpdateAdminCategoryDto {
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

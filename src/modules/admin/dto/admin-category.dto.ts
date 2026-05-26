import { IsObject, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import type { CatalogTranslationPayload } from './admin-city.dto';

export type { CatalogTranslationPayload };

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
  translations?: Record<string, CatalogTranslationPayload>;
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
  translations?: Record<string, CatalogTranslationPayload>;
}

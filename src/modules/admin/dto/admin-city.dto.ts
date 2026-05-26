import { IsObject, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export type CatalogTranslationPayload = {
  name?: string;
};

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
  translations?: Record<string, CatalogTranslationPayload>;
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
  translations?: Record<string, CatalogTranslationPayload>;
}

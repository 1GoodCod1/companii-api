import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

export enum SeoUrlKind {
  COMPANIES = 'companies',
  CATEGORIES = 'categories',
  LANDINGS = 'landings',
}

export class QuerySeoUrlsDto {
  @IsEnum(SeoUrlKind)
  kind!: SeoUrlKind;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(2000)
  limit?: number = 500;
}

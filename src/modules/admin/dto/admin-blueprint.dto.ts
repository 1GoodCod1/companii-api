import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class AdminBlueprintConfigDto {
  [key: string]: unknown;
}

export class CreateAdminBlueprintDto {
  @IsString()
  categoryId!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;

  @IsObject()
  @Type(() => AdminBlueprintConfigDto)
  config!: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateAdminBlueprintDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;

  @IsOptional()
  @IsObject()
  @Type(() => AdminBlueprintConfigDto)
  config?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

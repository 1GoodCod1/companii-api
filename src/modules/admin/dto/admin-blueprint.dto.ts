import { IsBoolean, IsInt, IsObject, IsOptional, IsString, Min, MinLength } from 'class-validator';

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
  config!: Record<string, any>;

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
  config?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

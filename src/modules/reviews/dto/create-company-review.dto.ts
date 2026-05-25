import { IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateCompanyReviewDto {
  @IsUUID()
  companyId!: string;

  @IsUUID()
  interventionId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  clientName?: string;
}

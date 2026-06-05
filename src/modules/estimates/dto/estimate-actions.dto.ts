import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ConvertEstimateDto {
  @IsOptional()
  @IsIn(['single', 'by-stage'])
  mode?: 'single' | 'by-stage';
}

export class ApplyTemplateDto {
  @IsOptional()
  @IsIn(['overwrite', 'append', 'pricing'])
  mode?: 'overwrite' | 'append' | 'pricing';
}

export class AddContractorCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}

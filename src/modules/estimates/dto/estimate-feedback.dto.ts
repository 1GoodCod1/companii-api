import { IsOptional, IsString, IsNotEmpty, MaxLength } from 'class-validator';

export class CreateEstimateFeedbackDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  projectId?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  category!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  details!: string;
}

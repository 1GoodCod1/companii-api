import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PipelineColumnQueryDto {
  @IsString()
  status!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  cursor?: string;
}

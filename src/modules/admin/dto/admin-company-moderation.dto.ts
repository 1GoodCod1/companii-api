import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ModerateCompanyDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

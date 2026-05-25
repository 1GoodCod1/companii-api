import { IsString, IsUUID } from 'class-validator';

export class SwitchCompanyDto {
  @IsString()
  @IsUUID()
  companyId!: string;
}

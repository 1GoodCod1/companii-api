import { IsBoolean } from 'class-validator';

export class UpdateAdminClientDto {
  @IsBoolean()
  isActive!: boolean;
}

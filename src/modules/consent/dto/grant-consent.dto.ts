import { IsEnum, IsString } from 'class-validator';
import { ConsentType } from '@prisma/client';

export class GrantConsentDto {
  @IsEnum(ConsentType)
  consentType!: ConsentType;

  @IsString()
  lawfulBasis!: string;

  @IsString()
  version!: string;
}

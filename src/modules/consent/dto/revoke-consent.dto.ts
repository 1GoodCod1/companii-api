import { IsEnum } from 'class-validator';
import { ConsentType } from '@prisma/client';

export class RevokeConsentDto {
  @IsEnum(ConsentType)
  consentType!: ConsentType;
}

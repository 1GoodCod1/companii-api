import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

export class PortalStatusDto {
  @IsIn(['ACCEPTED', 'REJECTED'])
  status!: 'ACCEPTED' | 'REJECTED';
}

export class RequestEstimateChangesDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  comment!: string;
}

export class SubmitPaymentProofDto {
  @IsString()
  @MaxLength(64)
  fileId!: string;
}

export class AcceptInvitationDto {
  @IsString()
  @MaxLength(256)
  token!: string;
}

export class AddEstimateCommentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  body!: string;
}

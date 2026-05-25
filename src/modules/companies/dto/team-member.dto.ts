import { IsIn, IsString, IsUUID } from 'class-validator';

export class UpdateMemberRoleDto {
  @IsIn(['MANAGER', 'MEMBER'])
  role!: 'MANAGER' | 'MEMBER';
}

export class TransferOwnershipDto {
  @IsString()
  @IsUUID()
  newOwnerUserId!: string;
}

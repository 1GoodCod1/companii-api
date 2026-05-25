import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateTeamInviteLinkDto {
  @IsIn(['MANAGER', 'MEMBER'])
  role!: 'MANAGER' | 'MEMBER';

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class AddTeamMemberDirectDto {
  @IsString()
  @MinLength(3)
  contact!: string;

  @IsIn(['MANAGER', 'MEMBER'])
  role!: 'MANAGER' | 'MEMBER';
}

export class AcceptTeamInviteDto {
  @IsString()
  @MinLength(8)
  token!: string;
}

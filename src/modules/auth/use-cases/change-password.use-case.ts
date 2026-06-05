import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AppErrors, AppErrorMessages } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';
import { ChangePasswordDto } from '@/modules/auth/dto/change-password.dto';
import type { JwtPayload } from '../types/jwt-payload';
import { AuthJwtPayloadService } from '../services/auth-jwt-payload.service';
import { TokenService } from '../services/token.service';

@Injectable()
export class ChangePasswordUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtPayload: AuthJwtPayloadService,
    private readonly tokens: TokenService,
  ) {}

  async execute(
    currentUser: JwtPayload,
    dto: ChangePasswordDto,
    currentRefreshToken?: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.sub },
    });
    if (!user || !user.passwordHash) {
      throw AppErrors.unauthorized(AppErrorMessages.AUTH_UNAUTHORIZED);
    }

    const ok = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!ok) {
      throw AppErrors.badRequest('Parola curentă este incorectă.');
    }

    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });

    const payload = await this.jwtPayload.enrichPayload(
      this.jwtPayload.buildPayload(user),
      { preferredCompanyId: currentUser.activeCompanyId },
    );
    return this.tokens.revokeOthersAndReissue(payload, currentRefreshToken);
  }
}

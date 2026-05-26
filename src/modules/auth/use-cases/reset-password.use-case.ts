import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AppErrors, AppErrorMessages } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';
import { AuditAction } from '../../audit/audit-action.enum';
import { AuditEntityType } from '../../audit/audit-entity-type.enum';
import { AuditService } from '../../audit/audit.service';
import { timingSafeStringEquals } from '../../../common/utils/timing-safe.util';
import { ResetPasswordDto } from '../dto/reset-password.dto';

@Injectable()
export class ResetPasswordUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async execute(dto: ResetPasswordDto) {
    const { token, password } = dto;

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetToken || !timingSafeStringEquals(resetToken.token, token)) {
      throw AppErrors.notFound(AppErrorMessages.RESET_TOKEN_INVALID);
    }

    if (resetToken.used) {
      throw AppErrors.badRequest(AppErrorMessages.RESET_TOKEN_USED);
    }

    if (resetToken.expiresAt < new Date()) {
      await this.prisma.passwordResetToken.delete({ where: { id: resetToken.id } });
      throw AppErrors.badRequest(AppErrorMessages.RESET_TOKEN_EXPIRED);
    }

    if (!resetToken.user || !resetToken.user.isActive) {
      throw AppErrors.badRequest(AppErrorMessages.AUTH_ACCOUNT_DISABLED);
    }

    const passwordHash = await argon2.hash(password);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      });

      await tx.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      });
    });

    await this.prisma.passwordResetToken.deleteMany({
      where: {
        userId: resetToken.userId,
        used: false,
      },
    });

    void this.audit.log({
      userId: resetToken.userId,
      action: AuditAction.PASSWORD_RESET_COMPLETED,
      entityType: AuditEntityType.User,
      entityId: resetToken.userId,
    });

    return {
      message: 'Parola a fost resetată cu succes.',
    };
  }
}

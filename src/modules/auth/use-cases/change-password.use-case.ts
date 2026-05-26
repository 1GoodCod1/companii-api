import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AppErrors, AppErrorMessages } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';
import { ChangePasswordDto } from '../dto/change-password.dto';

@Injectable()
export class ChangePasswordUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(userId: string, dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.passwordHash) {
      throw AppErrors.unauthorized(AppErrorMessages.AUTH_UNAUTHORIZED);
    }

    const ok = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!ok) {
      throw AppErrors.badRequest('Parola curentă este incorectă.');
    }

    const passwordHash = await argon2.hash(dto.newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { message: 'Parola a fost modificată cu succes.' };
  }
}

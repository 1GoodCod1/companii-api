import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../shared/database/prisma.service';
import { AuditAction } from '../../audit/audit-action.enum';
import { AuditEntityType } from '../../audit/audit-entity-type.enum';
import { AuditService } from '../../audit/audit.service';
import { EmailService } from '../../email/email.service';
import { RedisService } from '../../shared/redis/redis.service';
import { ForgotPasswordDto } from '@/modules/auth/dto/forgot-password.dto';

const GENERIC_RESPONSE = {
  message:
    'Dacă adresa de email există în baza de date, a fost trimis un link de resetare.',
} as const;

const PER_EMAIL_WINDOW_SEC = 60 * 60;
const PER_EMAIL_MAX = 3;

@Injectable()
export class ForgotPasswordUseCase {
  private readonly logger = new Logger(ForgotPasswordUseCase.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async execute(dto: ForgotPasswordDto) {
    const email = dto.email.toLowerCase().trim();

    if (await this.isOverEmailRateLimit(email)) {
      return GENERIC_RESPONSE;
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      return GENERIC_RESPONSE;
    }

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    await this.prisma.passwordResetToken.deleteMany({
      where: {
        userId: user.id,
        used: false,
      },
    });

    await this.prisma.passwordResetToken.create({
      data: {
        token,
        userId: user.id,
        expiresAt,
      },
    });

    const frontendUrl =
      this.configService.get<string>('frontendUrl') || 'http://localhost:5174';
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

    try {
      await this.email.sendPasswordResetEmail({
        to: user.email,
        resetUrl,
      });
    } catch (err) {
      this.logger.error('Password reset email failed to deliver', err as Error);
    }

    void this.audit.log({
      userId: user.id,
      action: AuditAction.PASSWORD_RESET_REQUESTED,
      entityType: AuditEntityType.User,
      entityId: user.id,
    });

    return GENERIC_RESPONSE;
  }

  private async isOverEmailRateLimit(email: string): Promise<boolean> {
    try {
      const client = this.redis.getClient();
      const key = `companii:forgot-pwd:email:${email}`;
      const count = await client.incr(key);
      if (count === 1) {
        await client.expire(key, PER_EMAIL_WINDOW_SEC);
      }
      return count > PER_EMAIL_MAX;
    } catch {
      return false;
    }
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { AppErrorMessages, AppErrors } from '../../../common/errors';
import { PrismaService } from '../../shared/database/prisma.service';
import { EmailService } from '../../email/email.service';

const VERIFICATION_TTL_HOURS = 24;

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
  ) {}

  async issueAndSend(user: {
    id: string;
    email: string;
    emailVerifiedAt: Date | null;
    firstName?: string | null;
  }): Promise<void> {
    if (user.emailVerifiedAt) return;

    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + VERIFICATION_TTL_HOURS);

    // Invalidate prior unused tokens so only the latest link works.
    await this.prisma.emailVerificationToken.deleteMany({
      where: { userId: user.id, used: false },
    });
    await this.prisma.emailVerificationToken.create({
      data: { token, userId: user.id, expiresAt },
    });

    const frontendUrl =
      this.config.get<string>('frontendUrl') || 'http://localhost:5174';
    const verifyUrl = `${frontendUrl}/verify-email?token=${token}`;

    try {
      await this.email.sendEmailVerificationEmail({
        to: user.email,
        verifyUrl,
        name: user.firstName ?? undefined,
      });
    } catch (err) {
      this.logger.error('Verification email failed to deliver', err as Error);
    }
  }

  async verify(token: string): Promise<{ message: string }> {
    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { token },
      include: { user: { select: { id: true, emailVerifiedAt: true } } },
    });

    if (!record || record.used) {
      throw AppErrors.badRequest(
        AppErrorMessages.EMAIL_VERIFICATION_TOKEN_INVALID,
      );
    }
    if (record.expiresAt < new Date()) {
      await this.prisma.emailVerificationToken.deleteMany({
        where: { id: record.id },
      });
      throw AppErrors.badRequest(
        AppErrorMessages.EMAIL_VERIFICATION_TOKEN_EXPIRED,
      );
    }

    if (!record.user.emailVerifiedAt) {
      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: record.userId },
          data: { emailVerifiedAt: new Date() },
        }),
        this.prisma.emailVerificationToken.update({
          where: { id: record.id },
          data: { used: true },
        }),
      ]);
    }

    await this.prisma.emailVerificationToken.deleteMany({
      where: { userId: record.userId, used: false },
    });

    return { message: 'Adresa de email a fost confirmată cu succes.' };
  }

  async resend(userId: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, emailVerifiedAt: true, firstName: true },
    });
    if (!user) throw AppErrors.unauthorized(AppErrorMessages.AUTH_UNAUTHORIZED);
    if (user.emailVerifiedAt) {
      throw AppErrors.badRequest(AppErrorMessages.EMAIL_ALREADY_VERIFIED);
    }

    await this.issueAndSend(user);
    return {
      message: 'Am retrimis linkul de confirmare pe adresa dvs. de email.',
    };
  }
}

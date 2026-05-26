import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';
import { isEmailLogin, normalizePhone, phoneVariants } from '../../../common/utils/phone.util';

@Injectable()
export class AuthUserLookupService {
  constructor(private readonly prisma: PrismaService) {}

  async findByLogin(login: string) {
    if (isEmailLogin(login)) {
      return this.prisma.user.findUnique({ where: { email: login.toLowerCase() } });
    }

    const normalizedPhone = normalizePhone(login);
    if (!normalizedPhone) return null;

    return this.prisma.user.findFirst({
      where: {
        OR: phoneVariants(normalizedPhone).map((variant) => ({ phone: variant })),
      },
    });
  }
}

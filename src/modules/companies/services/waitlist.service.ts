import { Inject, Injectable } from '@nestjs/common';
import { WAITLIST_REPOSITORY } from '../domain/ports/waitlist.repository.port';
import type { PrismaWaitlistRepository } from '../infrastructure/persistence/prisma-waitlist.repository';

@Injectable()
export class WaitlistService {
  constructor(
    @Inject(WAITLIST_REPOSITORY)
    private readonly waitlistRepo: PrismaWaitlistRepository,
  ) {}

  submit(email: string, companyName: string) {
    return this.waitlistRepo.create(email.toLowerCase(), companyName);
  }

  list() {
    return this.waitlistRepo.findRecent(200);
  }
}

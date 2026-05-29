import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/database/prisma.service';

@Injectable()
export class FindCitiesUseCase {
  constructor(private readonly prisma: PrismaService) {}

  execute() {
    return this.prisma.city.findMany({
      orderBy: { name: 'asc' },
    });
  }
}

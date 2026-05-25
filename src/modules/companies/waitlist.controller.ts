import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { AccountKind } from '@prisma/client';
import { CONTROLLER_PATH } from '../../common/constants';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaService } from '../shared/database/prisma.service';

class WaitlistDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  companyName!: string;
}

@Controller(CONTROLLER_PATH.companiesWaitlist)
export class WaitlistController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Post()
  async submit(@Body() dto: WaitlistDto) {
    return this.prisma.companyWaitlist.create({
      data: { email: dto.email.toLowerCase(), companyName: dto.companyName },
    });
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('PLATFORM_ADMIN')
  async list() {
    return this.prisma.companyWaitlist.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }
}

import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { CONTROLLER_PATH } from '../../../common/constants';
import { Public } from '../../../common/decorators/public.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/roles.guard';
import { WaitlistService } from '../services/waitlist.service';

class WaitlistDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  companyName!: string;
}

@Controller(CONTROLLER_PATH.companiesWaitlist)
export class WaitlistController {
  constructor(private readonly waitlist: WaitlistService) {}

  @Public()
  @Post()
  async submit(@Body() dto: WaitlistDto) {
    return this.waitlist.submit(dto.email, dto.companyName);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('PLATFORM_ADMIN')
  async list() {
    return this.waitlist.list();
  }
}

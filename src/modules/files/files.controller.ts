import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { CONTROLLER_PATH } from '../../common/constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { FilesService } from './services/files.service';

@Controller(CONTROLLER_PATH.files)
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('upload')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.files.uploadFile(file, user.sub);
  }

  @Post('upload-many')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadMany(
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: JwtPayload,
  ) {
    const items = await this.files.uploadMany(files, user.sub);
    return { items };
  }

  @Get(':id/download')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async download(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.files.downloadFile(id, user, res);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.files.deleteFileIfOwned(id, user.sub);
    return { success: true };
  }
}

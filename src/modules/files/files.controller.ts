import {
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { FileVisibility } from '@prisma/client';
import { CONTROLLER_PATH } from '../../common/constants';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { FilesService } from './services/files.service';

function parseVisibility(raw: unknown): FileVisibility {
  if (typeof raw === 'string' && raw.toLowerCase() === 'public') {
    return FileVisibility.PUBLIC;
  }
  return FileVisibility.PRIVATE;
}

@Controller(CONTROLLER_PATH.files)
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('upload')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: JwtPayload,
    @Query('visibility') visibility?: string,
  ) {
    return this.files.uploadFile(file, user.sub, parseVisibility(visibility));
  }

  @Post('upload-many')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadMany(
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: JwtPayload,
    @Query('visibility') visibility?: string,
  ) {
    const items = await this.files.uploadMany(
      files,
      user.sub,
      parseVisibility(visibility),
    );
    return { items };
  }

  @Get(':id/download')
  @Public()
  @UseGuards(OptionalJwtAuthGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async download(
    @Param('id') id: string,
    @Req() req: Request & { user?: JwtPayload },
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.files.downloadFile(id, req.user, res);
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

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { FilesController } from './files.controller';
import { FilesService } from './services/files.service';
import { FilesValidationService } from './services/files-validation.service';
import { StorageService } from './services/storage.service';
import { createMulterOptions } from './config/multer-config.factory';

import { FILES_REPOSITORY } from './domain/ports/files.repository.port';
import { PrismaFilesRepository } from './infrastructure/persistence/prisma-files.repository';

@Module({
  imports: [
    MulterModule.registerAsync({
      imports: [ConfigModule],
      useFactory: createMulterOptions,
      inject: [ConfigService],
    }),
  ],
  controllers: [FilesController],
  providers: [
    FilesService,
    FilesValidationService,
    StorageService,
    {
      provide: FILES_REPOSITORY,
      useClass: PrismaFilesRepository,
    },
  ],
  exports: [StorageService],
})
export class FilesModule {}

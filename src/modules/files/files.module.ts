import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { FilesController } from './files.controller';
import { FilesService } from './services/files.service';
import { FilesValidationService } from './services/files-validation.service';
import { createMulterOptions } from './config/multer-config.factory';

@Module({
  imports: [
    MulterModule.registerAsync({
      imports: [ConfigModule],
      useFactory: createMulterOptions,
      inject: [ConfigService],
    }),
  ],
  controllers: [FilesController],
  providers: [FilesService, FilesValidationService],
  exports: [FilesService],
})
export class FilesModule {}

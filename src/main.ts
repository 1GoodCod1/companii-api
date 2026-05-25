import 'dotenv/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { RequestHandler } from 'express';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { WinstonModule } from 'nest-winston';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors';
import { requestIdMiddleware } from './common/request-context';
import {
  applyGlobalPrefix,
  createShutdownHandler,
  getCorsOptions,
  getHelmetConfig,
  validateProductionSecrets,
  winstonConfig,
} from './config';

const isShuttingDownRef = { current: false };

async function bootstrap() {
  const bootstrapLogger = new Logger('Bootstrap');
  const isProd = process.env.NODE_ENV === 'production';

  const app = await NestFactory.create(AppModule, {
    logger: false,
    bufferLogs: true,
    cors: false,
  });

  app.useLogger(WinstonModule.createLogger(winstonConfig));
  app.use(requestIdMiddleware);
  app.use(cookieParser());
  app.use(helmet(getHelmetConfig(isProd)));
  app.use((compression as () => RequestHandler)());

  const config = app.get(ConfigService);
  validateProductionSecrets(config);

  applyGlobalPrefix(app);
  app.enableCors(getCorsOptions());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter(config));
  app.useGlobalInterceptors(new TransformInterceptor());

  if (!isProd) {
    const swagger = new DocumentBuilder()
      .setTitle('Faber Companii API')
      .setDescription('B2B/B2C multi-tenant API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));
  }

  const port = config.get<number>('port') ?? 4100;
  await app.listen(port);

  const shutdown = createShutdownHandler(app, isShuttingDownRef);
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  bootstrapLogger.log(`Companii API listening on http://localhost:${port}`);
  bootstrapLogger.log(`REST base: /api/v1 | Health: /health`);
  if (!isProd) bootstrapLogger.log(`Swagger: http://localhost:${port}/docs`);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});

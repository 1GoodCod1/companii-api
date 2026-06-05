import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { getRequestId } from '../request-context';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  constructor(private readonly configService?: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let rawBody: string | object;

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = this.mapPrismaError(exception);
      status = mapped.status;
      rawBody = mapped.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      rawBody = exception.getResponse();
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      rawBody = { statusCode: status, message: 'Internal server error' };
    }

    const isProd =
      this.configService?.get<string>('nodeEnv') === 'production' ||
      process.env.NODE_ENV === 'production';

    const payload = this.buildErrorPayload(status, rawBody, isProd);
    const requestId = getRequestId();

    const errorResponse = {
      success: false,
      statusCode: status,
      ...payload,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      ...(requestId ? { requestId } : {}),
    };

    const isRefreshClientError =
      status === 401 &&
      typeof request.url === 'string' &&
      request.url.includes('/auth/refresh');

    const isAuthClientError =
      status === 401 &&
      typeof request.url === 'string' &&
      (request.url.includes('/auth/login') || request.url.includes('/auth/register'));

    const isExpectedGuestAuthCheck =
      status === 401 &&
      typeof request.url === 'string' &&
      (request.url.includes('/auth/me') ||
       request.url.includes('/companies/me') ||
       request.url.includes('/subscriptions/me') ||
       request.url.includes('/portal/dashboard'));

    const logSuffix = requestId ? ` requestId=${requestId}` : '';
    if (isRefreshClientError || isExpectedGuestAuthCheck) {
      this.logger.debug(
        `${request.method} ${request.url} - ${status}${logSuffix}`,
      );
    } else if (isAuthClientError) {
      this.logger.warn(
        `${request.method} ${request.url} - ${status}${logSuffix}`,
      );
    } else if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} - ${status}${logSuffix}`,
        exception instanceof Error ? exception.stack : '',
      );
    } else {
      this.logger.warn(`${request.method} ${request.url} - ${status}${logSuffix}`);
    }

    response.status(status).json(errorResponse);
  }

  private buildErrorPayload(
    status: number,
    raw: string | object,
    hideProd500Details: boolean,
  ): Record<string, unknown> {
    if (hideProd500Details && status >= 500) {
      return { message: 'Internal server error' };
    }
    if (typeof raw === 'string') return { message: raw };
    const o = raw as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    if (o.message !== undefined) out.message = o.message;
    else if (typeof o.error === 'string') out.message = o.error;
    else out.message = 'Request failed';
    if (typeof o.error === 'string') out.error = o.error;
    if (o.fields !== undefined) out.fields = o.fields;
    return out;
  }

  private mapPrismaError(exception: Prisma.PrismaClientKnownRequestError): {
    status: number;
    message: object;
  } {
    switch (exception.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          message: {
            message: 'Unique constraint violation',
            fields: exception.meta?.target,
          },
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          message: { message: 'Record not found' },
        };
      case 'P2003':
        return {
          status: HttpStatus.CONFLICT,
          message: {
            message: 'Referenced record does not exist or is locked',
          },
        };
      case 'P2034':
        return {
          status: HttpStatus.CONFLICT,
          message: { message: 'Concurrent update conflict, please retry' },
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          message: { message: 'Internal server error' },
        };
    }
  }
}

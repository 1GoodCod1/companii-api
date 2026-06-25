import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

export class AppErrors {
  private constructor() {}

  static badRequest(message: string | Record<string, unknown>): BadRequestException {
    return new BadRequestException(message);
  }

  static notFound(message: string): NotFoundException {
    return new NotFoundException(message);
  }

  static forbidden(message: string): ForbiddenException {
    return new ForbiddenException(message);
  }

  static unauthorized(message: string): UnauthorizedException {
    return new UnauthorizedException(message);
  }

  static conflict(message: string | Record<string, unknown>): ConflictException {
    return new ConflictException(message);
  }

  static tooManyRequests(message: string): HttpException {
    return new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
  }

  static internal(message: string): InternalServerErrorException {
    return new InternalServerErrorException(message);
  }
}

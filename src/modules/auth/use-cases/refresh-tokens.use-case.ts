import { Injectable } from '@nestjs/common';
import { TokenService } from '../services/token.service';
import { AuthJwtPayloadService } from '../services/auth-jwt-payload.service';

@Injectable()
export class RefreshTokensUseCase {
  constructor(
    private readonly tokens: TokenService,
    private readonly jwtPayload: AuthJwtPayloadService,
  ) {}

  async execute(refreshToken: string) {
    return this.tokens.refreshTokens(refreshToken, (p) => this.jwtPayload.enrichPayload(p));
  }
}

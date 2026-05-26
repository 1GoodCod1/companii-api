import { Injectable } from '@nestjs/common';
import type { JwtPayload } from '../types/jwt-payload';
import { TokenService } from './token.service';

@Injectable()
export class AuthSessionService {
  constructor(private readonly tokens: TokenService) {}

  async issue(payload: JwtPayload, rememberMe: boolean) {
    const accessToken = this.tokens.signAccessToken(payload);
    const refreshToken = await this.tokens.generateRefreshToken(payload.sub, rememberMe);
    return {
      accessToken,
      refreshToken,
      user: payload,
      rememberMe,
    };
  }
}

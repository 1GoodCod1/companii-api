import { Injectable } from '@nestjs/common';
import { TokenService } from '../services/token.service';

@Injectable()
export class LogoutUseCase {
  constructor(private readonly tokens: TokenService) {}

  async execute(refreshToken: string) {
    await this.tokens.revokeRefreshToken(refreshToken);
    return { message: 'Logged out successfully' };
  }
}

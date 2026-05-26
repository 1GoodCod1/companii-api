import { Injectable } from '@nestjs/common';
import { TokenService } from '../services/token.service';

@Injectable()
export class LogoutAllUseCase {
  constructor(private readonly tokens: TokenService) {}

  async execute(userId: string) {
    await this.tokens.revokeAllForUser(userId);
    return { message: 'All sessions logged out' };
  }
}

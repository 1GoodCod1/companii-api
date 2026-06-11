import { Controller, Post, Body } from '@nestjs/common';
import { NotificationsActionService } from './services/notifications-action.service';

@Controller('webhooks/telegram')
export class TelegramWebhookController {
  constructor(private readonly actionService: NotificationsActionService) {}

  @Post()
  async handleWebhook(@Body() update: any) {
    if (!update || !update.message) return { ok: true };

    const message = update.message;
    const chatId = message.chat?.id;
    const text = message.text || '';

    // Handle /start <token> command
    if (text.startsWith('/start ')) {
      const token = text.split(' ')[1];
      if (token && chatId) {
        await this.actionService.linkTelegramAccount(token, String(chatId));
      }
    }

    return { ok: true };
  }
}

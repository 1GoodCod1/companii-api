import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

@Processor('telegram')
export class TelegramProcessor extends WorkerHost {
  private readonly logger = new Logger(TelegramProcessor.name);

  async process(job: Job<any, any, string>): Promise<any> {
    switch (job.name) {
      case 'send_message': {
        const { chatId, message } = job.data;
        await this.sendMessageToTelegram(chatId, message);
        break;
      }
    }
  }

  private async sendMessageToTelegram(chatId: string, text: string) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      this.logger.warn('TELEGRAM_BOT_TOKEN not provided, skipping message send.');
      return;
    }

    try {
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
        }),
      });

      if (!response.ok) {
        const errData = await response.text();
        this.logger.error(`Telegram API error: ${response.status} ${errData}`);
      }
    } catch (err) {
      this.logger.error(`Failed to send telegram message: ${err.message}`);
    }
  }
}

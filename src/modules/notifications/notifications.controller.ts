import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { Observable, fromEvent } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { NotificationsQueryService } from './services/notifications-query.service';
import { NotificationsActionService } from './services/notifications-action.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly queryService: NotificationsQueryService,
    private readonly actionService: NotificationsActionService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Sse('stream')
  stream(@CurrentUser() user: JwtPayload): Observable<MessageEvent> {
    return fromEvent(this.eventEmitter, 'notification.created').pipe(
      filter((payload: any) => payload.userId === user.sub),
      map((payload) => ({ data: payload } as MessageEvent)),
    );
  }

  @Get()
  async getNotifications(
    @CurrentUser() user: JwtPayload,
    @Query('limit') limitStr?: string,
    @Query('unreadOnly') unreadOnlyStr?: string,
  ) {
    const limit = limitStr ? parseInt(limitStr, 10) : 50;
    const unreadOnly = unreadOnlyStr === 'true';
    return this.queryService.getUserNotifications(user.sub, { limit, unreadOnly });
  }

  @Post('telegram/token')
  async generateTelegramToken(@CurrentUser() user: JwtPayload) {
    return this.actionService.generateTelegramToken(user.sub);
  }

  @Patch('preferences')
  async updatePreferences(@CurrentUser() user: JwtPayload, @Body() body: { inApp?: boolean; telegram?: boolean }) {
    return this.actionService.updateNotifyPreferences(user.sub, body);
  }

  @Get('unread-count')
  async getUnreadCount(@CurrentUser() user: JwtPayload) {
    return this.queryService.getUnreadCount(user.sub);
  }

  @Patch(':id/read')
  async markAsRead(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.actionService.markAsRead(user.sub, id);
  }

  @Patch('mark-all-read')
  async markAllAsRead(@CurrentUser() user: JwtPayload) {
    return this.actionService.markAllAsRead(user.sub);
  }

  @Delete(':id')
  async deleteNotification(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.actionService.deleteNotification(user.sub, id);
  }

  @Delete()
  async deleteAllNotifications(@CurrentUser() user: JwtPayload) {
    return this.actionService.deleteAllNotifications(user.sub);
  }
}

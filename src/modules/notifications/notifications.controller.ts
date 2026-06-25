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
import { Observable, fromEvent, merge, timer } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Streaming } from '../../common/decorators/streaming.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload';
import { NotificationsQueryService } from './services/notifications-query.service';
import { NotificationsActionService } from './services/notifications-action.service';
import type { NotificationCreatedEvent } from './services/notifications-sender.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

/**
 * Keep-alive interval for the SSE stream. A periodic comment-like `ping` event
 * keeps idle proxies/load balancers from closing the connection. Named events
 * do not trigger EventSource.onmessage, so clients ignore them.
 */
const SSE_HEARTBEAT_MS = 25_000;

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly queryService: NotificationsQueryService,
    private readonly actionService: NotificationsActionService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Sse('stream')
  @Streaming()
  stream(@CurrentUser() user: JwtPayload): Observable<MessageEvent> {
    const notifications$ = fromEvent<NotificationCreatedEvent>(
      this.eventEmitter,
      'notification.created',
    ).pipe(
      filter((payload) => payload.userId === user.sub),
      map(
        (payload) =>
          ({
            data: payload.notification ?? { id: payload.notificationId },
          }) as MessageEvent,
      ),
    );

    // Heartbeat keeps the connection alive through idle periods; the immediate
    // first tick also confirms the stream is open right after connect.
    const heartbeat$ = timer(0, SSE_HEARTBEAT_MS).pipe(
      map(() => ({ type: 'ping', data: Date.now().toString() }) as MessageEvent),
    );

    return merge(heartbeat$, notifications$);
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

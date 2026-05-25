import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditLogWriterService } from './services/audit-log-writer.service';
import { AuditInterceptor } from './audit.interceptor';

@Module({
  providers: [AuditService, AuditLogWriterService, AuditInterceptor],
  exports: [AuditService, AuditInterceptor],
})
export class AuditModule {}

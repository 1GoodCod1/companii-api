import { Injectable } from '@nestjs/common';
import { AuditLogWriterService } from './services/audit-log-writer.service';
import type { AuditLogData } from './types/audit.types';

@Injectable()
export class AuditService {
  constructor(private readonly writer: AuditLogWriterService) {}

  log(data: AuditLogData) {
    return this.writer.log(data);
  }
}

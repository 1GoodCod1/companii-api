import { Injectable, Logger } from '@nestjs/common';
import type { WebVitalDto } from './web-vitals.dto';

interface BucketEntry {
  total: number;
  count: number;
  p75: number;
  p95: number;
  latest: number;
}

@Injectable()
export class WebVitalsStoreService {
  private readonly logger = new Logger(WebVitalsStoreService.name);

  // In-memory rolling window (last 500 measurements per metric).
  private readonly recent = new Map<string, number[]>();
  private readonly MAX_VALUES = 500;

  record(dto: WebVitalDto): void {
    const key = dto.name;
    if (!this.recent.has(key)) {
      this.recent.set(key, []);
    }
    const values = this.recent.get(key)!;
    values.push(dto.value);
    if (values.length > this.MAX_VALUES) {
      values.splice(0, values.length - this.MAX_VALUES);
    }
  }

  getSnapshot(): Record<string, BucketEntry & { p90: number; p99: number }> {
    const result: Record<string, BucketEntry & { p90: number; p99: number }> = {};
    for (const [name, values] of this.recent) {
      if (values.length === 0) continue;
      const sorted = [...values].sort((a, b) => a - b);
      const p75 = percentile(sorted, 75);
      const p90 = percentile(sorted, 90);
      const p95 = percentile(sorted, 95);
      const p99 = percentile(sorted, 99);
      result[name] = {
        total: sorted.reduce((s, v) => s + v, 0),
        count: sorted.length,
        p75,
        p90,
        p95,
        p99,
        latest: sorted[sorted.length - 1],
      };
    }
    return result;
  }

  /** Returns true if any metric's p95 exceeds its threshold for alerting. */
  checkAlerts(): string[] {
    const thresholds: Record<string, number> = {
      FCP: 2500,
      LCP: 2500,
      INP: 200,
      CLS: 0.1,
      TTFB: 800,
    };
    const alerts: string[] = [];
    const snapshot = this.getSnapshot();
    for (const [name, entry] of Object.entries(snapshot)) {
      const threshold = thresholds[name];
      if (threshold && entry.p95 > threshold) {
        alerts.push(
          `${name}: p95=${entry.p95}ms exceeds threshold ${threshold}ms (count=${entry.count})`,
        );
        this.logger.warn(
          `CWV ALERT: ${name} p95=${entry.p95} > threshold ${threshold}`,
        );
      }
    }
    return alerts;
  }
}

function percentile(sorted: number[], pct: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((pct / 100) * sorted.length) - 1;
  return sorted[Math.min(idx, sorted.length - 1)];
}
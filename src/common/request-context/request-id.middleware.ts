import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { requestContext } from './request-context.storage';

export interface RequestWithId extends Request {
  requestId?: string;
}

export function requestIdMiddleware(
  req: RequestWithId,
  res: Response,
  next: NextFunction,
): void {
  const incoming = req.headers['x-request-id'];
  const id =
    typeof incoming === 'string' && incoming.trim()
      ? incoming.trim().slice(0, 128)
      : randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  requestContext.run({ requestId: id }, () => next());
}

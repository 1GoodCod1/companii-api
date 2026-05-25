export type RequestLike = {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string } | null;
};

export type RequestContext = {
  ipAddress: string | undefined;
  userAgent: string | undefined;
};

export function extractRequestContext(req: RequestLike): RequestContext {
  const forwarded = req.headers?.['x-forwarded-for'];
  const ipAddress =
    req.ip ||
    (typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined) ||
    req.socket?.remoteAddress;
  const userAgent =
    typeof req.headers?.['user-agent'] === 'string'
      ? req.headers['user-agent']
      : undefined;
  return { ipAddress, userAgent };
}

import { SetMetadata, applyDecorators } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';

/** Metadata flag marking a route as a long-lived streaming endpoint (e.g. SSE). */
export const IS_STREAMING_KEY = 'is_streaming_endpoint';

/**
 * `@nestjs/common`'s SSE_METADATA value. It is set by `@Sse()` on the handler
 * but is not re-exported from the package root, so we mirror the constant here.
 */
const NEST_SSE_METADATA = '__sse__';

/**
 * Marks a route as a long-lived streaming endpoint (Server-Sent Events).
 *
 * Streaming responses must opt out of behaviour that assumes a short
 * request/response cycle:
 *  - the global 30s TimeoutInterceptor (would tear the stream down on idle),
 *  - the TransformInterceptor JSON envelope (would corrupt every SSE frame by
 *    double-wrapping the MessageEvent),
 *  - rate limiting (a single stream plus its reconnects must not consume the
 *    per-route request budget).
 *
 * The throttle opt-out is applied here via {@link SkipThrottle}; the global
 * interceptors detect the route through {@link isStreamingHandler}.
 */
export const Streaming = () =>
  applyDecorators(SetMetadata(IS_STREAMING_KEY, true), SkipThrottle());

/**
 * True when the handler is a streaming endpoint — either explicitly marked with
 * {@link Streaming} or decorated with Nest's own `@Sse()`.
 */
export function isStreamingHandler(handler: object): boolean {
  return (
    Reflect.getMetadata(IS_STREAMING_KEY, handler) === true ||
    Reflect.getMetadata(NEST_SSE_METADATA, handler) !== undefined
  );
}

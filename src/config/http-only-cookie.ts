export function resolveUseHttpOnlyCookie(): boolean {
  return (
    process.env.USE_HTTPONLY_COOKIE === 'true' ||
    (process.env.USE_HTTPONLY_COOKIE === undefined &&
      process.env.NODE_ENV === 'production')
  );
}

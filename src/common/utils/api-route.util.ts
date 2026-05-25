import { API_GLOBAL_PREFIX } from '../../config/http-app';

export function stripApiPrefix(path: string): string {
  const prefix = `/${API_GLOBAL_PREFIX}`;
  if (path.startsWith(prefix)) {
    return path.slice(prefix.length) || '/';
  }
  return path;
}

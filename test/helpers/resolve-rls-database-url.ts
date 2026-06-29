/**
 * Resolve a DATABASE_URL that connects as the non-superuser `companii_app` role
 * (created by migrations) for RLS smoke tests.
 */
export function resolveRlsRuntimeDatabaseUrl(baseUrl: string | undefined): string | undefined {
  if (process.env.E2E_RLS_DATABASE_URL) {
    return process.env.E2E_RLS_DATABASE_URL;
  }
  if (!baseUrl) {
    return undefined;
  }
  if (baseUrl.includes('companii_app')) {
    return baseUrl;
  }
  if (baseUrl.includes('postgres:companii')) {
    return baseUrl.replace('postgres:companii', 'companii_app:companii_app_pass');
  }

  try {
    const url = new URL(baseUrl);
    url.username = 'companii_app';
    url.password = 'companii_app_pass';
    return url.toString();
  } catch {
    return undefined;
  }
}

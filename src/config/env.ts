export interface AppEnvConfig {
  apiBaseUrl: string;
  isDemoMode: boolean;
  defaultApiMode: 'mock' | 'real';
}

export function getEnvConfig(): AppEnvConfig {
  const env = (typeof import.meta !== 'undefined' && import.meta.env) || ({} as Record<string, string>);
  const rawBase = env.VITE_API_BASE_URL || '';
  const apiBaseUrl = String(rawBase).trim().replace(/\/+$/, '');
  const isTestEnv = env.MODE === 'test' || Boolean(env.VITEST);
  const forcedMode = env.VITE_API_MODE;

  const defaultApiMode: 'mock' | 'real' =
    forcedMode === 'mock' || (isTestEnv && forcedMode !== 'real' && !apiBaseUrl)
      ? 'mock'
      : 'real';

  return {
    apiBaseUrl,
    isDemoMode: true,
    defaultApiMode,
  };
}

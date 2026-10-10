const env = (key: string): string =>
  (((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[key] ?? "") as string).trim();

/** Public ZEGO App ID; safe for client builds. The signing secret stays on the server. */
export const ZEGO_APP_ID = Number(env("VITE_ZEGO_APP_ID") || 0);
export const isZegoConfigured = () => Number.isSafeInteger(ZEGO_APP_ID) && ZEGO_APP_ID > 0;

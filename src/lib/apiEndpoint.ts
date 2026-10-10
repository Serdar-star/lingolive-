import { Capacitor } from "@capacitor/core";

const env = (key: string): string =>
  (((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[key] ?? "") as string).trim();

export const isNativeApp = Capacitor.isNativePlatform();
const rawBaseUrl = env("VITE_API_BASE_URL").replace(/\/+$/, "");

function httpsUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? url.toString().replace(/\/+$/, "")
      : "";
  } catch {
    return "";
  }
}

/**
 * Web builds use same-origin /api routes by default. Native WebViews must use
 * an HTTPS server origin; a relative /api URL would point back into the APK.
 * Per-service absolute HTTPS URLs override the shared VITE_API_BASE_URL.
 */
export function resolveApiEndpoint(overrideKey: string, defaultPath: string): string {
  const override = env(overrideKey).replace(/\s+/g, "");
  if (!isNativeApp) return (override || defaultPath).replace(/\/$/, "");

  const remoteOverride = httpsUrl(override);
  if (remoteOverride) return remoteOverride;
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(override)) return "";

  const base = httpsUrl(rawBaseUrl);
  if (!base) return "";
  const path = override.startsWith("/")
    ? override
    : override
      ? `/${override}`
      : defaultPath;
  return `${base}${path}`.replace(/\/$/, "");
}

export function missingNativeApiMessage(service: string): string {
  return `${service} is not configured in this Android build. Set VITE_API_BASE_URL to your deployed HTTPS API host (or set a service-specific HTTPS URL) and rebuild the Android web bundle.`;
}

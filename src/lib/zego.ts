/* ──────────────────────────────────────────────────────────
   LINGOLIVE — ZEGO helpers
   The browser never receives ZEGO_SERVER_SECRET. It requests a
   short-lived, room-scoped Token04 from the authenticated server.
   The large prebuilt SDK is fetched as a separate same-origin asset
   only when the learner actually joins a call or room.
   ────────────────────────────────────────────────────────── */
import type { ZegoUIKitPrebuilt as ZegoUIKitPrebuiltInstance } from "@zegocloud/zego-uikit-prebuilt";
import { supabase } from "./supabase";
import { isNativeApp, missingNativeApiMessage, resolveApiEndpoint } from "./apiEndpoint";
import { ZEGO_APP_ID, isZegoConfigured } from "./zegoConfig";

export type ZegoUIKitPrebuilt = ZegoUIKitPrebuiltInstance;
type ZegoUIKitPrebuiltStatic = typeof import("@zegocloud/zego-uikit-prebuilt").ZegoUIKitPrebuilt;
type ZegoWindow = Window & { ZegoUIKitPrebuilt?: ZegoUIKitPrebuiltStatic };

const ZEGO_TOKEN_URL = resolveApiEndpoint("VITE_ZEGO_TOKEN_URL", "/api/zego-token");
const ZEGO_SDK_URL = resolveApiEndpoint("VITE_ZEGO_SDK_URL", "/vendor/zego-uikit-prebuilt.js");
export { ZEGO_APP_ID, isZegoConfigured };

let sdkPromise: Promise<ZegoUIKitPrebuiltStatic> | null = null;

/** Load the vendor UMD bundle on demand, keeping it out of the main app build. */
export function loadZegoUIKitPrebuilt(): Promise<ZegoUIKitPrebuiltStatic> {
  if (!ZEGO_SDK_URL) return Promise.reject(new Error(missingNativeApiMessage("ZEGO SDK asset")));
  const current = (window as ZegoWindow).ZegoUIKitPrebuilt;
  if (current) return Promise.resolve(current);
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<ZegoUIKitPrebuiltStatic>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = ZEGO_SDK_URL;
    script.async = true;
    script.dataset.lingoliveZegoSdk = "true";
    script.onload = () => {
      const sdk = (window as ZegoWindow).ZegoUIKitPrebuilt;
      if (sdk) resolve(sdk);
      else reject(new Error("ZEGO SDK loaded but its browser API was not found."));
    };
    script.onerror = () => reject(new Error("ZEGO call SDK could not be loaded. Check the vendor asset deployment."));
    document.head.appendChild(script);
  }).catch((error) => {
    sdkPromise = null;
    throw error;
  });

  return sdkPromise;
}

/** Random URL-safe room ID. */
export function genRoomId(prefix = "lingo"): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "")
    : `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  return `${prefix}_${random}`;
}

/**
 * Requests a 60-minute, authenticated ZEGO Token04, then wraps it in
 * the Call Kit token. The signing secret is server-only.
 */
export async function kitToken(
  roomId: string,
  userId: string,
  userName: string,
  canPublish = true,
  callId?: string,
  backendRoomId?: string,
): Promise<string> {
  if (!isZegoConfigured()) throw new Error("ZEGO App ID is missing from this build.");
  if (!ZEGO_TOKEN_URL) throw new Error(missingNativeApiMessage("ZEGO token service"));
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !session?.access_token || session.user.id !== userId) {
    throw new Error("Sign in again before starting a ZEGO call.");
  }
  const response = await fetch(ZEGO_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ roomId, canPublish, ...(callId ? { callId } : {}), ...(backendRoomId ? { backendRoomId } : {}) }),
  });
  const result = await response.json().catch(() => ({})) as { token?: string; appId?: number; error?: string };
  if (!response.ok || !result.token) {
    throw new Error(result.error || `ZEGO token request failed (${response.status}).`);
  }
  const appId = Number(result.appId || ZEGO_APP_ID);
  const zego = await loadZegoUIKitPrebuilt();
  return zego.generateKitTokenForProduction(appId, result.token, roomId, userId, userName);
}

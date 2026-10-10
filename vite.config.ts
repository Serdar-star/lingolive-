import path from "path";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin, type PluginOption } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { issueZegoToken } from "./api/shared/zegoToken";
import { handleTursoApi } from "./api/shared/tursoApi";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_AUDIO_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

/** Keep ZEGO's 5 MB prebuilt SDK as a same-origin lazy-loaded asset. Parsing it as
 * part of the Rollup graph inflated peak build memory even though calls are rare. */
function zegoSdkAsset(): Plugin {
  const sdkPath = path.resolve(__dirname, "node_modules/@zegocloud/zego-uikit-prebuilt/zego-uikit-prebuilt.js");
  const licensePath = `${sdkPath}.LICENSE.txt`;
  const assets = new Map([
    ["/vendor/zego-uikit-prebuilt.js", { path: sdkPath, type: "text/javascript; charset=utf-8" }],
    ["/vendor/zego-uikit-prebuilt.LICENSE.txt", { path: licensePath, type: "text/plain; charset=utf-8" }],
  ]);
  return {
    name: "lingolive-zego-sdk-asset",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url || "/", "http://vite.local").pathname;
        const asset = assets.get(pathname);
        if (!asset) return next();
        if (req.method !== "GET" && req.method !== "HEAD") {
          res.statusCode = 405;
          res.end("Method not allowed");
          return;
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", asset.type);
        res.setHeader("Content-Length", statSync(asset.path).size);
        res.setHeader("Cache-Control", "public, max-age=3600");
        if (req.method === "HEAD") return res.end();
        createReadStream(asset.path).pipe(res);
      });
    },
    generateBundle() {
      for (const [url, asset] of assets) {
        this.emitFile({
          type: "asset",
          fileName: url.slice(1),
          source: readFileSync(asset.path),
        });
      }
    },
  };
}

function localAiProxy(apiKey: string, serverEnv: Record<string, string>): Plugin {
  const recentRequests = new Map<string, number[]>();
  return {
    name: "lingolive-local-ai-proxy",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = new URL(req.url || "/", "http://vite.local").pathname;
        if (pathname === "/api/turso") {
          void (async () => {
            const chunks: Buffer[] = [];
            let size = 0;
            for await (const chunk of req) {
              const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any);
              size += part.length;
              if (size > 1024 * 1024) {
                res.statusCode = 413;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "Request is too large." }));
                return;
              }
              chunks.push(part);
            }
            const authorization = req.headers.authorization;
            const result = await handleTursoApi({
              method: req.method || "GET",
              authorization: Array.isArray(authorization) ? authorization[0] : authorization,
              body: Buffer.concat(chunks).toString("utf8"),
              env: serverEnv,
            });
            res.statusCode = result.status;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(result.body));
          })().catch((error) => {
            console.error("Local Turso request failed:", error instanceof Error ? error.message : error);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
            }
            res.end(JSON.stringify({ error: "Content database request failed." }));
          });
          return;
        }
        if (pathname === "/api/zego-token") {
          void (async () => {
            if (req.method !== "POST") {
              res.statusCode = 405;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "POST only" }));
              return;
            }
            const chunks: Buffer[] = [];
            let size = 0;
            for await (const chunk of req) {
              const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any);
              size += part.length;
              if (size > 32 * 1024) {
                res.statusCode = 413;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "Request is too large." }));
                return;
              }
              chunks.push(part);
            }
            const authorization = req.headers.authorization;
            const result = await issueZegoToken({
              method: req.method || "GET",
              authorization: Array.isArray(authorization) ? authorization[0] : authorization,
              body: Buffer.concat(chunks).toString("utf8"),
              env: serverEnv,
            });
            res.statusCode = result.status;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(result.body));
          })().catch((error) => {
            console.error("Local ZEGO token request failed:", error instanceof Error ? error.message : error);
            if (!res.headersSent) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
            }
            res.end(JSON.stringify({ error: "ZEGO token request failed." }));
          });
          return;
        }
        if (!pathname.startsWith("/api/ai/")) return next();
        void (async () => {
          if (req.method !== "POST") {
            res.statusCode = 405;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "POST only" }));
            return;
          }
          if (!apiKey) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Set GROQ_API_KEY in the server-side .env file." }));
            return;
          }

          const forwarded = req.headers["x-forwarded-for"];
          const ip = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(",")[0]?.trim() || req.socket.remoteAddress || "local";
          const now = Date.now();
          const hits = (recentRequests.get(ip) || []).filter((stamp) => now - stamp < 60_000);
          if (hits.length >= 30) {
            res.statusCode = 429;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "local AI proxy rate limit reached; wait a minute and retry" }));
            return;
          }
          hits.push(now);
          recentRequests.set(ip, hits);

          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of req) {
            const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any);
            size += part.length;
            if (size > 25 * 1024 * 1024) {
              res.statusCode = 413;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ error: "audio/request exceeds the 25 MB limit" }));
              return;
            }
            chunks.push(part);
          }
          const body = Buffer.concat(chunks);

          try {
            if (pathname === "/api/ai/chat") {
              let payload: any;
              try { payload = JSON.parse(body.toString("utf8")); }
              catch {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "bad json" }));
                return;
              }
              const messages = Array.isArray(payload.messages) ? payload.messages.slice(-40) : [];
              if (!messages.length) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "messages required" }));
                return;
              }
              const stream = payload.stream === true;
              const upstream = await fetch(GROQ_CHAT_URL, {
                method: "POST",
                headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  model: "openai/gpt-oss-20b",
                  reasoning_effort: "low",
                  temperature: typeof payload.temperature === "number" ? payload.temperature : 0.7,
                  max_tokens: Math.min(Number(payload.max_tokens) || 512, 4096),
                  stream,
                  messages,
                  ...(payload.response_format ? { response_format: payload.response_format } : {}),
                }),
              });
              if (stream && upstream.ok && upstream.body) {
                res.statusCode = 200;
                res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
                res.setHeader("Cache-Control", "no-cache, no-transform");
                res.setHeader("Connection", "keep-alive");
                const reader = upstream.body.getReader();
                for (;;) {
                  const { done, value } = await reader.read();
                  if (done || res.destroyed) break;
                  res.write(Buffer.from(value));
                }
                res.end();
                return;
              }
              res.statusCode = upstream.status;
              res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
              res.end(await upstream.text());
              return;
            }

            if (pathname === "/api/ai/transcribe") {
              const contentType = req.headers["content-type"];
              if (!contentType?.toLowerCase().startsWith("multipart/form-data;")) {
                res.statusCode = 400;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ error: "multipart audio upload required" }));
                return;
              }
              const upstream = await fetch(GROQ_AUDIO_URL, {
                method: "POST",
                headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": contentType },
                body,
              });
              res.statusCode = upstream.status;
              res.setHeader("Content-Type", upstream.headers.get("content-type") || "text/plain; charset=utf-8");
              res.end(await upstream.text());
              return;
            }

            res.statusCode = 404;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "unknown AI route" }));
          } catch (error) {
            console.error("Local Groq proxy request failed:", error instanceof Error ? error.message : error);
            if (!res.headersSent) {
              res.statusCode = 502;
              res.setHeader("Content-Type", "application/json");
            }
            res.end(JSON.stringify({ error: "Groq request failed; check the server network and API key." }));
          }
        })();
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // All .env names are read server-side here; only VITE_* values enter browser code.
  const env = loadEnv(mode, process.cwd(), "");
  const serverKey = env.GROQ_API_KEY || "";
  const plugins: PluginOption[] = [react(), tailwindcss(), localAiProxy(serverKey, env), zegoSdkAsset()];
  // Inlining the entire ZEGO SDK into one HTML file can exceed constrained CI memory.
  // Capacitor and Vercel both support Vite's normal multi-file dist by default.
  if (env.VITE_SINGLE_FILE_BUILD === "true") plugins.push(viteSingleFile());
  return {
    plugins,
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
      allowedHosts: true,
    },
  };
});

// SERVER ONLY — USAePay helpers. Never import from client code.
import { createHash, randomBytes } from "crypto";

export type UsaepayConfig = {
  apiKey: string;
  apiPin: string;
  mode: "sandbox" | "live";
  baseUrl: string;
};

export function loadUsaepayConfig(): UsaepayConfig | null {
  const apiKey = process.env.USAEPAY_API_KEY;
  const apiPin = process.env.USAEPAY_API_PIN;
  if (!apiKey || !apiPin) return null;
  const mode = (process.env.USAEPAY_MODE === "live" ? "live" : "sandbox") as
    | "sandbox"
    | "live";
  const baseUrl =
    mode === "live"
      ? "https://secure.usaepay.com/api/v2"
      : "https://sandbox.usaepay.com/api/v2";
  return { apiKey, apiPin, mode, baseUrl };
}

export function buildUsaepayAuthHeader(cfg: UsaepayConfig): string {
  const seed = randomBytes(16).toString("hex");
  const hash = createHash("sha256")
    .update(cfg.apiKey + seed + cfg.apiPin)
    .digest("hex");
  const token = Buffer.from(`${cfg.apiKey}:${hash}:${seed}`).toString("base64");
  return `Basic ${token}`;
}

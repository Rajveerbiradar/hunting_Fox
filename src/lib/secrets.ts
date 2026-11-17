import crypto from "node:crypto";
import { adminClient } from "@/lib/supabase/clients";

// AES-256-GCM. The key comes from KEYS_SECRET (falls back to the service role key).
function key() {
  const s = process.env.KEYS_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!s) throw new Error("KEYS_SECRET is not set");
  return crypto.createHash("sha256").update(s).digest();
}

export function encrypt(plain: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decrypt(blob: string) {
  const [iv, tag, enc] = blob.split(".").map((p) => Buffer.from(p, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

export const last4 = (s: string) => (s.length > 4 ? s.slice(-4) : "");

// Settings changed in /admin take effect within 30 seconds on every server.
let cache: { at: number; values: Record<string, string> } | null = null;

export async function settings(): Promise<Record<string, string>> {
  if (cache && Date.now() - cache.at < 30_000) return cache.values;
  const values: Record<string, string> = {};
  try {
    const { data } = await adminClient().from("app_secrets").select("name,value_enc");
    (data || []).forEach((r) => {
      try { values[r.name] = decrypt(r.value_enc); } catch { /* wrong KEYS_SECRET: ignore */ }
    });
  } catch { /* table missing: env only */ }
  cache = { at: Date.now(), values };
  return values;
}

/** Admin value first, then the env variable. */
export async function setting(name: string, envName: string) {
  return (await settings())[name] || process.env[envName] || "";
}

export async function saveSetting(name: string, value: string) {
  const sb = adminClient();
  if (!value) await sb.from("app_secrets").delete().eq("name", name);
  else await sb.from("app_secrets").upsert({ name, value_enc: encrypt(value), last4: last4(value), updated_at: new Date().toISOString() });
  cache = null;
}

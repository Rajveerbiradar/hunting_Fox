import { adminClient } from "@/lib/supabase/clients";
import { decrypt } from "@/lib/secrets";
import type { Provider } from "@/lib/ai";

export type OwnKeys = {
  apify: { token: string; fallback: "free" | "stop" } | null;
  ai: Provider | null;
};

/** A student's own keys, decrypted. Only ever used for that student's own searches. */
export async function ownKeys(userId: string): Promise<OwnKeys> {
  const out: OwnKeys = { apify: null, ai: null };
  try {
    const { data } = await adminClient().from("user_keys").select("*").eq("user_id", userId);
    for (const r of data || []) {
      let key = "";
      try { key = decrypt(r.key_enc); } catch { continue; }
      if (r.kind === "apify" && r.ok !== false) out.apify = { token: key, fallback: r.fallback === "stop" ? "stop" : "free" };
      if (r.kind === "ai" && r.base_url && r.model) out.ai = { id: "own", name: r.provider || "Your AI", baseURL: r.base_url, apiKey: key, model: r.model };
    }
  } catch { /* table missing */ }
  return out;
}

/** Does this student search on their own Apify key right now? (Then searches don't count.) */
export async function hasOwnApify(userId: string) {
  const { data } = await adminClient().from("user_keys").select("ok").eq("user_id", userId).eq("kind", "apify").maybeSingle();
  return !!data && data.ok !== false;
}

import { Spinner } from "./ui";

/** Shown the moment a page is opened, while the server gets its data (used by every loading.tsx). */
export function PageLoading({ label = "Loading…", rows = 3, wide = false }: { label?: string; rows?: number; wide?: boolean }) {
  return (
    <>
      <header className="hd">
        <div className="hdi" style={wide ? { maxWidth: 1240 } : undefined}>
          <span className="logo"><span className="lm">{/* eslint-disable-next-line @next/next/no-img-element */}<img src="/fox-white.png" alt="" width={24} height={24} /></span><span className="wm">hunting fox</span></span>
        </div>
      </header>
      <main className={`wrap${wide ? " wide" : ""}`} aria-busy="true">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }} role="status">
          <Spinner size={20} />
          <span className="mute" style={{ fontSize: 16, fontWeight: 600 }}>{label}</span>
        </div>
        <div className="sk" style={{ height: 40, width: "60%", marginTop: 24 }} />
        <div className="sk" style={{ height: 18, width: "85%", marginTop: 14 }} />
        <div className="card" style={{ marginTop: 28, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <div className="sk" style={{ width: 48, height: 48, flex: "none" }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="sk" style={{ height: 16, width: "45%" }} />
                <div className="sk" style={{ height: 12, width: "70%" }} />
              </div>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}

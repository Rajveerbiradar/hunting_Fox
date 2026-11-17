import { AutoPrint } from "./AutoPrint";

export function ResumeSheet({ lines, print = true }: { lines: string[]; print?: boolean }) {
  const [name, ...rest] = lines;
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px max(16px, 6vw)", background: "#fff", minHeight: "100vh", fontSize: 14, lineHeight: 1.55 }}>
      {print && <AutoPrint />}
      <h1 style={{ margin: 0, fontSize: 26 }}>{name?.replace(/^##\s*/, "")}</h1>
      {rest.map((l, i) =>
        l.startsWith("## ") ? (
          <h2 key={i} style={{ margin: "20px 0 6px", fontSize: 12, textTransform: "uppercase", letterSpacing: ".08em", borderBottom: "1px solid #ddd", paddingBottom: 4 }}>{l.slice(3)}</h2>
        ) : (
          <p key={i} style={{ margin: "2px 0" }}>{l}</p>
        )
      )}
    </main>
  );
}

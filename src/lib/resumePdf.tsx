import path from "node:path";
import { Document, Font, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/types";

// Our own resume PDF, built on the server from the same lines ResumeDoc draws on screen
// (# Name, > Headline, @ contact, ## Section, ### Title | Dates, - bullet, plain, **bold**).
// No browser print dialog, so no date, page title, web address or page numbers added by Chrome.

let fontsReady = false;
function fonts() {
  if (fontsReady) return;
  const dir = path.join(process.cwd(), "assets", "fonts");
  Font.register({
    family: "Reddit Sans",
    fonts: [
      { src: path.join(dir, "reddit-sans-latin-400-normal.woff"), fontWeight: 400 },
      { src: path.join(dir, "reddit-sans-latin-600-normal.woff"), fontWeight: 600 },
      { src: path.join(dir, "reddit-sans-latin-700-normal.woff"), fontWeight: 700 },
    ],
  });
  Font.registerHyphenationCallback((w) => [w]); // never split words with a hyphen
  fontsReady = true;
}

const INK = "#101828", MUTE = "#5B6472";
const s = StyleSheet.create({
  page: { fontFamily: "Reddit Sans", fontSize: 10, lineHeight: 1.45, color: INK, paddingVertical: 36, paddingHorizontal: 44 },
  name: { fontSize: 21, lineHeight: 1.25, fontWeight: 700, textAlign: "center", letterSpacing: -0.3 },
  headline: { fontSize: 11, lineHeight: 1.3, fontWeight: 600, textAlign: "center", marginTop: 2 },
  contact: { fontSize: 9, color: MUTE, textAlign: "center", marginTop: 4 },
  section: { fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", marginTop: 13, marginBottom: 4, paddingBottom: 3, borderBottomWidth: 1.2, borderBottomColor: INK },
  entry: { flexDirection: "row", justifyContent: "space-between", marginTop: 5, marginBottom: 1 },
  entryLeft: { fontWeight: 700, flexShrink: 1, paddingRight: 10 },
  entryTech: { fontWeight: 400, color: MUTE },
  dates: { color: MUTE, fontSize: 9 },
  bulletRow: { flexDirection: "row", marginTop: 1.5 },
  dot: { width: 10 },
  bulletText: { flex: 1 },
  para: { marginTop: 1.5 },
});

/** **bold** → bold runs; everything else as written. */
function Rich({ text, style }: { text: string; style?: Style }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <Text style={style}>
      {parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") && p.length > 4 ? <Text key={i} style={{ fontWeight: 700 }}>{p.slice(2, -2)}</Text> : p))}
    </Text>
  );
}

export async function resumePdf(lines: string[], title: string): Promise<Buffer> {
  fonts();
  const rows = lines.map((l) => l.trim()).filter(Boolean);
  return renderToBuffer(
    <Document title={title} author={title.split(" - ")[0]} creator="Hunting Fox" producer="Hunting Fox">
      <Page size="A4" style={s.page} wrap>
        {rows.map((l, i) => {
          if (l.startsWith("# ") || (i === 0 && !l.startsWith("## "))) return <Rich key={i} text={l.replace(/^#\s*/, "")} style={s.name} />;
          if (l.startsWith("> ")) return <Rich key={i} text={l.slice(2)} style={s.headline} />;
          if (l.startsWith("@ ")) return <Text key={i} style={s.contact}>{l.slice(2).replace(/\*\*/g, "")}</Text>;
          if (l.startsWith("## ")) return <Text key={i} style={s.section} minPresenceAhead={30}>{l.slice(3)}</Text>;
          if (l.startsWith("### ")) {
            const [left, right] = l.slice(4).split(" | ");
            const tech = left.match(/^(.*?) (\(.+\))$/);
            return (
              <View key={i} style={s.entry} wrap={false} minPresenceAhead={20}>
                <Text style={s.entryLeft}>{(tech ? tech[1] : left).replace(/\*\*/g, "")}{tech && <Text style={s.entryTech}> {tech[2]}</Text>}</Text>
                {right && <Text style={s.dates}>{right}</Text>}
              </View>
            );
          }
          if (/^[-•]\s/.test(l)) return (
            <View key={i} style={s.bulletRow} wrap={false}>
              <Text style={s.dot}>•</Text>
              <Rich text={l.replace(/^[-•]\s*/, "")} style={s.bulletText} />
            </View>
          );
          return <Rich key={i} text={l} style={s.para} />;
        })}
      </Page>
    </Document>
  );
}

/** "Rajveer Biradar - Resume - Sure.pdf", safe for a download header. */
export function pdfName(name: string, company?: string) {
  const base = `${name || "Resume"} - Resume${company ? ` - ${company}` : ""}`;
  return base.replace(/[^\w .()&-]/g, "").replace(/\s+/g, " ").trim().slice(0, 90) + ".pdf";
}

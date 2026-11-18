import { AutoPrint } from "./AutoPrint";
import { ResumeDoc } from "./ResumeDoc";

/** A full page with just the resume in our template. Used for the PDF download and the shared link. */
export function ResumeSheet({ lines, print = true, pdfHref }: { lines: string[]; print?: boolean; pdfHref?: string }) {
  return (
    <main style={{ padding: "32px max(16px, env(safe-area-inset-left, 0px)) 48px", background: "#f2f4f7", minHeight: "100vh" }}>
      {print && <div style={{ maxWidth: 794, margin: "0 auto 16px" }}><AutoPrint /></div>}
      {pdfHref && <div style={{ maxWidth: 794, margin: "0 auto 16px", display: "flex", justifyContent: "flex-end" }}><a className="btn sec" href={pdfHref} download>Download PDF</a></div>}
      <ResumeDoc lines={lines} />
    </main>
  );
}

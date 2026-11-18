import { AutoPrint } from "./AutoPrint";
import { ResumeDoc } from "./ResumeDoc";
import { PdfButton } from "./PdfButton";

/** A full page with just the resume in our template. Used for the PDF download and the shared link. */
export function ResumeSheet({ lines, print = true, pdfSource }: { lines: string[]; print?: boolean; pdfSource?: string }) {
  return (
    <main style={{ padding: "32px max(16px, env(safe-area-inset-left, 0px)) 48px", background: "#f2f4f7", minHeight: "100vh" }}>
      {print && <div style={{ maxWidth: 794, margin: "0 auto 16px" }}><AutoPrint /></div>}
      {pdfSource && <div style={{ maxWidth: 794, margin: "0 auto 16px", display: "flex", justifyContent: "flex-end" }}><PdfButton lines={lines} source={pdfSource} className="btn sec">Download PDF</PdfButton></div>}
      <ResumeDoc lines={lines} />
    </main>
  );
}

"use client";
import { useEffect } from "react";

export function AutoPrint() {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 400);
    return () => clearTimeout(t);
  }, []);
  return (
    <p className="noprint" style={{ background: "#F5F5F7", padding: "12px 16px", borderRadius: 14, fontSize: 14, marginTop: 0 }}>
      Choose <b>Save as PDF</b> in the print window to download your resume.
    </p>
  );
}

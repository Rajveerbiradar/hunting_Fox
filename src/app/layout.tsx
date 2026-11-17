import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hunting Fox · land the job, not just apply",
  description: "Paste a job. See what to change in your resume, who works there, and what to send them.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = { themeColor: "#f5f5f7", viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Reddit+Sans:wght@400;500;600;700;800&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}

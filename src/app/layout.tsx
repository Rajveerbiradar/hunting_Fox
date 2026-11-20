import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PressFeedback } from "@/components/PressFeedback";

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || "https://huntingfox.journeytix.com").replace(/\/$/, "");
const DESC = "Upload your resume, paste a LinkedIn job link, and see what to change for that job, the skills people there have, and who to ask for a referral. 5 free searches.";

// The link-preview cover (WhatsApp, LinkedIn, X…): public/og.png, 1200×630. Without it, apps showed the big app icon.
export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "Hunting Fox · get noticed for the job, not just apply",
  description: DESC,
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.png", apple: "/icon.png" },
  openGraph: {
    type: "website", url: SITE, siteName: "Hunting Fox",
    title: "Hunting Fox · get noticed for the job, not just apply", description: DESC,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Hunting Fox: upload your resume, paste a LinkedIn job link, ask for a referral" }],
  },
  twitter: { card: "summary_large_image", title: "Hunting Fox · get noticed for the job, not just apply", description: DESC, images: ["/og.png"] },
};

export const viewport: Viewport = { themeColor: "#F2F4F7", viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Reddit+Sans:wght@400..700&display=swap" />
      </head>
      <body>{children}<PressFeedback /></body>
    </html>
  );
}

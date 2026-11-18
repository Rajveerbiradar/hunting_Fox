"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LinkBox } from "./LinkBox";
import { ProgressPopup } from "./ProgressPopup";
import { announceJob } from "./ui";

/** The paste box with its own progress popup, for pages other than Home (My jobs, a job that stopped). */
export function SearchBox({ email }: { email?: string }) {
  const router = useRouter();
  const [scanId, setScanId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  return (
    <>
      <LinkBox signedIn onStarting={() => setStarting(true)} onFailed={() => setStarting(false)} onStarted={(id) => { setScanId(id); announceJob(); }} />
      {(starting || scanId) && <ProgressPopup jobId={scanId} email={email} onClose={() => { setScanId(null); setStarting(false); router.refresh(); }} />}
    </>
  );
}

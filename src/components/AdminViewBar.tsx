/** Shown on a student's job pages when the admin opens them: what you see is theirs, and it's read-only. */
export function AdminViewBar({ name }: { name?: string | null }) {
  return (
    <div role="status" style={{ position: "sticky", top: 0, zIndex: 40, background: "#e7effa", color: "#164a88", fontSize: 14, fontWeight: 600, textAlign: "center", padding: "8px 16px" }}>
      Admin view of {name || "a student"}&apos;s job: you see what they see. Buttons that change things won&apos;t work here.
    </div>
  );
}

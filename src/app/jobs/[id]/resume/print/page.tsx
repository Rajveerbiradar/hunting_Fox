import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Old "print" links now get our own PDF file. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/api/jobs/${id}/pdf`);
}

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Old "print" links go to the resume page, where Download PDF makes the file. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/jobs/${id}/resume`);
}

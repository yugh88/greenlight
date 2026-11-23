import { NextResponse } from "next/server";
import { dbErrorMessage, getJob } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const job = await getJob(id);
    if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(job, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    console.error("getJob failed", e);
    return NextResponse.json({ error: dbErrorMessage(e) }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

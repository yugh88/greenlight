import { after, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { createJob, findRunningJob, getGuide } from "@/lib/store";
import { runJob } from "@/lib/agent/run-job";
import { slugify } from "@/lib/agent/discover";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { input?: string; regenerate?: boolean };
  const input = (body.input ?? "").trim().slice(0, 120);
  if (input.length < 2) return NextResponse.json({ error: "Enter an app name or website" }, { status: 400 });

  if (!body.regenerate) {
    const cached = await getGuide(slugify(input));
    if (cached) return NextResponse.json({ slug: cached.slug, cached: true });
  }
  const running = await findRunningJob(input);
  if (running) return NextResponse.json({ jobId: running.id });

  const jobId = nanoid(10);
  await createJob(jobId, input);
  after(() => runJob(jobId, input));
  return NextResponse.json({ jobId });
}

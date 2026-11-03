import "server-only";
import { runPipeline } from "./pipeline";
import { appendStep, finishJob, saveGuide } from "@/lib/store";

/** Runs the pipeline for a job, persisting every step so /generate/[jobId] can stream it. */
export async function runJob(jobId: string, input: string) {
  let pending: Promise<unknown> = Promise.resolve();
  const emit = (stage: Parameters<Parameters<typeof runPipeline>[1]>[0], message: string, detail?: unknown) => {
    const step = { at: new Date().toISOString(), stage, message, detail: sanitize(detail) };
    pending = pending.then(() => appendStep(jobId, step)).catch(() => undefined);
  };
  try {
    const r = await runPipeline(input, emit);
    const guide = r.guide;
    await saveGuide(guide);
    emit("publish", `Published /guides/${guide.slug} in ${Math.round(r.report.ms / 1000)}s`, { slug: guide.slug, report: r.report });
    await pending;
    await finishJob(jobId, { status: "done", slug: guide.slug });
  } catch (e) {
    const msg = (e as Error).message?.slice(0, 500) ?? "unknown error";
    emit("error", `Generation failed: ${msg}`);
    await pending;
    await finishJob(jobId, { status: "error", error: msg });
  }
}

function sanitize(d: unknown) {
  if (d === undefined) return undefined;
  const s = JSON.stringify(d);
  return s.length > 4000 ? JSON.parse(JSON.stringify({ truncated: s.slice(0, 4000) })) : d;
}

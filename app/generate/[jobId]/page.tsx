import { RunView } from "./run-view";

export const metadata = { title: "Generating guide" };

export default async function GeneratePage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  return <RunView jobId={jobId} />;
}

import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
for (const id of ["gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.8-flash"]) {
  try {
    const r = await generateText({ model: google(id), tools: { google_search: google.tools.googleSearch({}) },
      prompt: "What is the URL of Strava's official API OAuth authentication documentation? Answer with the URL only.", maxRetries: 1, abortSignal: AbortSignal.timeout(90_000) });
    console.log(id, "OK", r.text.slice(0, 150), "| sources:", (r.sources ?? []).length);
  } catch (e: any) { console.log(id, "ERR", e?.statusCode ?? "", String(e?.message).slice(0, 220)); }
}

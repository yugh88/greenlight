import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
for (const id of ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"]) {
  const t0 = Date.now();
  try {
    const r = await generateText({ model: google(id), prompt: "Reply with the single word: ok", maxRetries: 0, abortSignal: AbortSignal.timeout(90_000) });
    console.log(id, "OK", JSON.stringify(r.text), `${Date.now() - t0}ms`, r.response?.modelId ?? "");
  } catch (e: any) {
    console.log(id, "ERR", e?.statusCode ?? "", String(e?.message).slice(0, 200), String(e?.responseBody ?? "").slice(0, 300), `${Date.now() - t0}ms`);
  }
}

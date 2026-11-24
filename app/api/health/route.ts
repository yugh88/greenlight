import { NextResponse } from "next/server";
import { dbStatus } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Which database is serving (primary / fallback / embedded) and the health of each. No secrets: hosts only. */
export async function GET() {
  const db = await dbStatus();
  return NextResponse.json({ ok: Boolean(db.active), db }, { status: db.active ? 200 : 503, headers: { "cache-control": "no-store" } });
}

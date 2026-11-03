import { ImageResponse } from "next/og";
import { getGuide } from "@/lib/store";
import { fmtDays, fmtMinutes } from "@/lib/format";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Greenlight OAuth app guide";

const COLORS: Record<number, string> = { 1: "#34d399", 2: "#a3e635", 3: "#facc15", 4: "#fb923c", 5: "#fb7185" };

export default async function OG({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const g = await getGuide(slug);
  const name = g?.app.name ?? slug;
  const d = g?.verdict.difficulty ?? 3;
  const c = COLORS[d];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: "#0a0a0a", color: "#fafafa", padding: 64, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28, color: "#a1a1aa" }}>
          <div style={{ width: 18, height: 18, borderRadius: 9, background: "#34d399" }} />
          Greenlight · OAuth app setup guide
          {g?.endToEnd ? (
            <div style={{ display: "flex", marginLeft: "auto", fontSize: 24, color: "#6ee7b7", border: "2px solid #34d399", borderRadius: 12, padding: "6px 14px" }}>
              ✓ Tested end-to-end via Composio
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", fontSize: 88, fontWeight: 700, marginTop: 36, letterSpacing: -2 }}>{name}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 28, marginTop: 28 }}>
          <div style={{ display: "flex", width: 120, height: 120, borderRadius: 24, background: "#18181b", border: `4px solid ${c}`, color: c, fontSize: 76, fontWeight: 700, alignItems: "center", justifyContent: "center" }}>{d}</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 44, color: c, fontWeight: 600 }}>{g?.verdict.label ?? ""}</div>
            <div style={{ display: "flex", fontSize: 26, color: "#a1a1aa", marginTop: 6 }}>difficulty {d} of 5</div>
          </div>
        </div>
        {g ? (
          <div style={{ display: "flex", gap: 24, marginTop: "auto" }}>
            {[
              ["First token", fmtMinutes(g.verdict.firstTokenMinutes)],
              ["Production", fmtDays(g.verdict.productionDays)],
              ["Evidence", `${g.claims.filter((x) => x.evidence !== "uncertain").length}/${g.claims.length} proven`],
            ].map(([k, v]) => (
              <div key={k} style={{ display: "flex", flexDirection: "column", background: "#18181b", borderRadius: 18, padding: "18px 26px", flex: 1 }}>
                <div style={{ display: "flex", fontSize: 22, color: "#a1a1aa" }}>{k}</div>
                <div style={{ display: "flex", fontSize: 40, fontWeight: 600, marginTop: 4 }}>{v}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    ),
    size,
  );
}

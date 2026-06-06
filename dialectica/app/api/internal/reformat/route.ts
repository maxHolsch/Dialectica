import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ArgMap } from "@/lib/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { autoFormatArgMap } from "@/lib/layout/autoFormatArgMap";
import { resolveStrategy } from "@/lib/layout/strategies";

export const runtime = "nodejs";

// Dev-only endpoint used by scripts/layout-format.ts to run ELK auto-format
// and trigger revalidatePath — both of which require the Next.js process.
// Uses the service-role client to bypass RLS (no user session in script context).
export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Only available in development" }, { status: 403 });
  }

  const { mapId, strategy } = (await req.json()) as {
    mapId?: string;
    strategy?: string;
  };
  if (!mapId) {
    return NextResponse.json({ error: "mapId required" }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  const { data, error } = await supabase
    .from("Dialectica_maps")
    .select("data")
    .eq("id", mapId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: `Map not found: ${mapId}` }, { status: 404 });

  const map = ArgMap.parse(data.data);
  const strategyId = resolveStrategy(strategy ?? "layered-down");
  const formatted = await autoFormatArgMap(map, strategyId);

  const next = ArgMap.parse({ ...formatted, updatedAt: new Date().toISOString() });
  const { error: updateError } = await supabase
    .from("Dialectica_maps")
    .update({ data: next, updated_at: next.updatedAt })
    .eq("id", mapId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  revalidatePath(`/m/${mapId}/crux`);
  revalidatePath(`/m/${mapId}/frame/[frameId]`, "page");

  return NextResponse.json({ ok: true, mapId, strategy: strategyId });
}

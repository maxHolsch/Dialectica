import { redirect } from "next/navigation";

/** Route /m/<mapId> → /m/<mapId>/crux per the plan. */
export default async function MapRoot({
  params,
}: {
  params: Promise<{ mapId: string }>;
}) {
  const { mapId } = await params;
  redirect(`/m/${mapId}/crux`);
}

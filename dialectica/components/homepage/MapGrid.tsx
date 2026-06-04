import type { MapCard as MapCardData } from "@/lib/data/maps";
import type { Mode } from "@/lib/data/users";
import { MapCard } from "./MapCard";

export function MapGrid({
  cards,
  mode,
}: {
  cards: MapCardData[];
  mode: Mode;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <MapCard key={card.id} card={card} mode={mode} />
      ))}
    </div>
  );
}

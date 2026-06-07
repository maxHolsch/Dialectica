import Image from "next/image";
import { cn } from "@/lib/utils";
import type { MapPreviewKind } from "@/lib/data/maps";
import { nightSkyImageForId } from "@/lib/data/nightSkyImages";

/** Stylized preview tile rendered in the top half of a MapCard. */
export function MapPreview({
  kind,
  id,
}: {
  kind: MapPreviewKind;
  id: string;
}) {
  return (
    <div className="relative h-[180px] w-full overflow-hidden bg-black">
      {kind === "empty" && (
        <Image
          src={nightSkyImageForId(id)}
          alt=""
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
          className="object-cover"
        />
      )}
      {kind === "circles-3" && (
        <>
          <Circle className="left-[88px] top-[40px] size-16 bg-dia-mint" />
          <Circle className="left-[160px] top-[20px] size-16 bg-dia-pink" />
          <Circle className="left-[120px] top-[88px] size-16 bg-dia-blue" />
        </>
      )}
      {kind === "frame-rects" && (
        <>
          <div className="absolute left-7 top-7 h-[124px] w-[514px] rounded border-2 border-dashed border-dia-pink" />
          <Rect className="left-7 top-[38px] bg-dia-mint" />
          <Rect className="left-[120px] top-[38px] bg-dia-pink" />
          <Rect className="left-[212px] top-[38px] bg-dia-blue" />
        </>
      )}
      {kind === "circles-2" && (
        <>
          <Circle className="left-[140px] top-[42px] size-16 bg-dia-mint" />
          <Circle className="left-[200px] top-[26px] size-16 bg-dia-pink" />
        </>
      )}
      {kind === "circles-rects" && (
        <>
          <div className="absolute left-7 top-7 h-[124px] w-[514px] rounded border-2 border-dashed border-dia-purple" />
          <Rect className="left-6 top-[30px] bg-dia-mint" />
          <Rect className="left-[100px] top-[30px] bg-dia-pink" />
          <Rect className="left-[176px] top-[30px] bg-dia-blue" />
          <Rect className="left-[60px] top-[110px] bg-dia-purple" />
          <Rect className="left-[160px] top-[110px] bg-dia-mint" />
        </>
      )}
      {kind === "circles-3-spread" && (
        <>
          <Circle className="left-[150px] top-[40px] size-16 bg-dia-mint" />
          <Circle className="left-[220px] top-[18px] size-16 bg-dia-pink" />
          <Circle className="left-[180px] top-[90px] size-16 bg-dia-blue" />
        </>
      )}
    </div>
  );
}

function Circle({ className }: { className?: string }) {
  return <div className={cn("absolute rounded-full", className)} />;
}

function Rect({ className }: { className?: string }) {
  return (
    <div className={cn("absolute h-[38px] w-14 rounded-[3px]", className)} />
  );
}

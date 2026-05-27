import { listMapCards } from "@/lib/data/maps";
import { Topbar } from "@/components/topbar/Topbar";
import { HeroBar } from "@/components/homepage/HeroBar";
import { HomepageTabs } from "@/components/homepage/HomepageTabs";
import { MapGrid } from "@/components/homepage/MapGrid";

/** DIA-HOME-1 — Homepage (map selector). Figma node 2:5. */
export default async function HomePage() {
  const cards = await listMapCards();

  return (
    <div className="flex min-h-screen flex-col bg-dia-bg">
      <Topbar
        crumbs={[
          { kind: "brand", label: "DIALECTIA" },
          { kind: "sep-slash" },
          { kind: "medium", label: "Home" },
        ]}
        pill={{ kind: "live", count: 2 }}
        avatars={[{ initials: "EM", color: "#cdf4d3" }]}
      />
      <main className="mx-auto w-full max-w-[1840px] flex-1 px-20 pb-20">
        <HeroBar />
        <div className="mt-[140px]">
          <HomepageTabs />
        </div>
        <div className="mt-7">
          <MapGrid cards={cards} />
        </div>
      </main>
    </div>
  );
}

export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import { RankingCircuito } from "@/components/RankingCircuito";
import { fetchRankingCircuito } from "@/lib/ranking-datos";

export default async function RankingPage() {
  const supabase = await createClient();
  const ranking = await fetchRankingCircuito(supabase);

  return (
    <main className="bg-background px-4 py-8 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <RankingCircuito ranking={ranking} />
      </div>
    </main>
  );
}

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { diffDaysDateOnly } from "@/lib/dates";
import type { Call, Profile, Punishment } from "@/lib/supabase/database.types";

export function PunishmentsCard({
  punishments,
  profiles,
  meId,
  today,
  overdueDays,
  overduePenalty,
  targetReps,
}: {
  punishments: (Punishment & { calls: Pick<Call, "id" | "call_date"> })[];
  profiles: Profile[];
  meId: string;
  today: string;
  overdueDays: number;
  overduePenalty: number;
  targetReps: number;
}) {
  if (punishments.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Open punishments</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {punishments.map((p) => {
          const person = profiles.find((pr) => pr.id === p.person_id);
          const daysOpen = diffDaysDateOnly(p.assigned_date, today) + 1;
          const nextPenaltyDay = overdueDays * (p.penalty_count + 1);
          const daysUntilPenalty = nextPenaltyDay - daysOpen;
          const label = p.person_id === meId ? "You" : person?.display_name ?? "Partner";

          return (
            <Link
              key={p.id}
              href="/punishments"
              className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
            >
              <div className="flex flex-col">
                <span className="font-medium">
                  {label} · {p.exercise_type?.replace("_", " ") ?? "choose exercise"}
                </span>
                <span className="text-xs text-muted-foreground">
                  Day {daysOpen} open
                  {p.penalty_count > 0 && ` · ${p.penalty_count} penalt${p.penalty_count === 1 ? "y" : "ies"} applied`}
                  {daysUntilPenalty >= 0
                    ? ` · -${overduePenalty} min in ${daysUntilPenalty} day${daysUntilPenalty === 1 ? "" : "s"}`
                    : " · penalty due"}
                </span>
              </div>
              <Badge variant="outline">{targetReps} reps</Badge>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

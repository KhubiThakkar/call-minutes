import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatDisplayDate } from "@/lib/dates";
import type { LedgerEntry, Profile } from "@/lib/supabase/database.types";

const TYPE_LABELS: Record<LedgerEntry["entry_type"], string> = {
  daily_credit: "Daily credit",
  move_ring: "Move ring",
  workout: "Workout",
  badge: "Weekly badge",
  call: "Call",
  punishment_overdue: "Punishment overdue",
  reversal: "Correction",
};

export function RecentLedgerCard({ entries, profiles }: { entries: LedgerEntry[]; profiles: Profile[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col divide-y">
        {entries.length === 0 && <p className="py-2 text-sm text-muted-foreground">No entries yet.</p>}
        {entries.map((entry) => {
          const person = profiles.find((p) => p.id === entry.person_id);
          return (
            <div key={entry.id} className="flex items-center justify-between py-2 text-sm">
              <div className="flex flex-col">
                <span>
                  {TYPE_LABELS[entry.entry_type]}
                  {person && <span className="text-muted-foreground"> · {person.display_name}</span>}
                </span>
                <span className="text-xs text-muted-foreground">{formatDisplayDate(entry.entry_date)}</span>
              </div>
              <span className={cn("font-medium tabular-nums", entry.amount < 0 ? "text-destructive" : "text-foreground")}>
                {entry.amount > 0 ? "+" : ""}
                {entry.amount}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

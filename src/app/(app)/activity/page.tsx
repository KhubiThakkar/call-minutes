import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getActivityLog } from "@/lib/data";

const ENTITY_LABELS: Record<string, string> = {
  call: "Call",
  move_ring: "Move ring",
  workout: "Workout",
  weekly_badge: "Weekly badge",
  punishment: "Punishment",
};

const ACTION_LABELS: Record<string, string> = {
  create: "created",
  edit: "edited",
  delete: "deleted",
  dispute: "disputed",
  tick: "ticked",
  untick: "unticked",
  claimed: "claimed",
  reversed: "reversed",
  reps_logged: "logged reps",
  voided: "voided",
};

export default async function ActivityPage() {
  const entries = await getActivityLog();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Activity log</h1>
      <Card>
        <CardContent className="flex flex-col divide-y py-0">
          {entries.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">No activity yet.</p>}
          {entries.map((entry) => (
            <div key={entry.id} className="flex flex-col gap-1 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span>
                  <span className="font-medium">{entry.actor?.display_name ?? "System"}</span>{" "}
                  {ACTION_LABELS[entry.action] ?? entry.action}{" "}
                  <Badge variant="outline" className="ml-1 text-[10px]">
                    {ENTITY_LABELS[entry.entity_type] ?? entry.entity_type}
                  </Badge>
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(entry.created_at).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
              {entry.detail != null && (
                <pre className="overflow-x-auto rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                  {JSON.stringify(entry.detail, null, 0)}
                </pre>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

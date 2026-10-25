"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock } from "lucide-react";
import { toggleMoveRing, logWorkout } from "@/lib/actions/economy";
import type { MoveRing, Profile, Workout } from "@/lib/supabase/database.types";

export function ChecklistCard({
  profiles,
  meId,
  today,
  todaysMoveRings,
  todaysWorkouts,
  moveRingBonus,
  workoutBonus,
}: {
  profiles: Profile[];
  meId: string;
  today: string;
  todaysMoveRings: MoveRing[];
  todaysWorkouts: Workout[];
  moveRingBonus: number;
  workoutBonus: number;
}) {
  const [pending, startTransition] = useTransition();

  function handleToggleRing(personId: string, ticked: boolean) {
    startTransition(async () => {
      try {
        await toggleMoveRing(personId, today, ticked);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not update move ring");
      }
    });
  }

  function handleLogWorkout(personId: string, duration: 30 | 45) {
    startTransition(async () => {
      try {
        await logWorkout(personId, today, duration);
        toast.success(`Workout logged (+${workoutBonus} min)`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not log workout");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Today&apos;s checklist</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {profiles.map((person) => {
          const ring = todaysMoveRings.find((r) => r.person_id === person.id);
          const workout = todaysWorkouts.find((w) => w.person_id === person.id);
          const isSelf = person.id === meId;
          const label = isSelf ? "You" : person.display_name;

          return (
            <div key={person.id} className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-medium">{label}</span>
                {!isSelf && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Lock className="size-3" />
                    Read-only
                  </span>
                )}
              </div>
              <div
                className={
                  isSelf
                    ? "flex flex-col gap-2"
                    : "flex flex-col gap-2 rounded-lg bg-muted/60 p-2 opacity-60 grayscale-[0.4] blur-[0.4px] saturate-50"
                }
              >
                <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <label htmlFor={`ring-${person.id}`} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      id={`ring-${person.id}`}
                      checked={!!ring?.ticked}
                      disabled={pending || !isSelf}
                      onCheckedChange={(checked) => handleToggleRing(person.id, checked === true)}
                    />
                    Move ring
                  </label>
                  <span className="text-xs text-muted-foreground">+{moveRingBonus} min</span>
                </div>
                <div className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span className="text-sm">Workout</span>
                  {workout ? (
                    <Badge variant="secondary">{workout.duration_minutes}m logged</Badge>
                  ) : isSelf ? (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => handleLogWorkout(person.id, 30)}>
                        30m
                      </Button>
                      <Button size="sm" variant="outline" disabled={pending} onClick={() => handleLogWorkout(person.id, 45)}>
                        45m
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Not logged</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { diffDaysDateOnly, formatDisplayDate } from "@/lib/dates";
import { logPunishmentAttempt } from "@/lib/actions/economy";
import type { Call, ExerciseType, Profile, Punishment } from "@/lib/supabase/database.types";

const EXERCISE_LABELS: Record<ExerciseType, string> = {
  push_ups: "Push-ups",
  tricep_curls: "Tricep curls",
};

export function PunishmentCard({
  punishment,
  attempts,
  person,
  isMine,
  today,
  overdueDays,
  overduePenalty,
  targetReps,
}: {
  punishment: Punishment & { calls: Pick<Call, "id" | "call_date"> };
  attempts: { day: string; reps: number }[];
  person: Profile | undefined;
  isMine: boolean;
  today: string;
  overdueDays: number;
  overduePenalty: number;
  targetReps: number;
}) {
  const [exerciseType, setExerciseType] = useState<ExerciseType | null>(punishment.exercise_type);
  const [reps, setReps] = useState("");
  const [pending, startTransition] = useTransition();

  const todaysTotal = attempts.filter((a) => a.day === today).reduce((sum, a) => sum + a.reps, 0);
  const daysOpen = diffDaysDateOnly(punishment.assigned_date, today) + 1;
  const nextPenaltyDay = overdueDays * (punishment.penalty_count + 1);
  const daysUntilPenalty = nextPenaltyDay - daysOpen;

  function submit() {
    const parsedReps = Number(reps);
    if (!parsedReps || parsedReps <= 0) {
      toast.error("Enter reps greater than 0");
      return;
    }
    startTransition(async () => {
      try {
        const result = await logPunishmentAttempt({
          punishmentId: punishment.id,
          reps: parsedReps,
          exerciseType: exerciseType ?? undefined,
        });
        setReps("");
        if (result && typeof result === "object" && "completed" in result && result.completed) {
          toast.success("Punishment cleared!");
        } else {
          toast.success("Reps logged");
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not log reps");
      }
    });
  }

  if (punishment.status !== "open") {
    return (
      <Card>
        <CardContent className="flex items-center justify-between py-3 text-sm">
          <span>
            {person?.display_name ?? "Partner"} ·{" "}
            {punishment.exercise_type ? EXERCISE_LABELS[punishment.exercise_type] : "—"} · assigned{" "}
            {formatDisplayDate(punishment.assigned_date)}
          </span>
          <Badge variant={punishment.status === "completed" ? "secondary" : "outline"}>
            {punishment.status}
          </Badge>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span>{isMine ? "You" : person?.display_name ?? "Partner"}</span>
          <Badge variant="outline">Day {daysOpen} open</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          From call on {formatDisplayDate(punishment.calls.call_date)}
          {punishment.penalty_count > 0 &&
            ` · ${punishment.penalty_count} penalt${punishment.penalty_count === 1 ? "y" : "ies"} applied (-${
              punishment.penalty_count * overduePenalty
            } min)`}
          {daysUntilPenalty >= 0
            ? ` · -${overduePenalty} min in ${daysUntilPenalty} day${daysUntilPenalty === 1 ? "" : "s"} if still open`
            : " · penalty due at next rollover"}
        </p>

        {!isMine ? (
          <p className="text-sm text-muted-foreground">Only {person?.display_name ?? "they"} can log reps for this one.</p>
        ) : !exerciseType ? (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setExerciseType("push_ups")}>
              Push-ups
            </Button>
            <Button variant="outline" size="sm" onClick={() => setExerciseType("tricep_curls")}>
              Tricep curls
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{EXERCISE_LABELS[exerciseType]} today</span>
                <span>
                  {todaysTotal} / {targetReps}
                </span>
              </div>
              <Progress value={Math.min(100, (todaysTotal / targetReps) * 100)} />
            </div>
            <div className="flex gap-2">
              <Input
                type="number"
                min={1}
                placeholder="Reps this set"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
              />
              <Button onClick={submit} disabled={pending}>
                Log
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Sets today add up toward {targetReps}; tomorrow starts back at zero if not cleared.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

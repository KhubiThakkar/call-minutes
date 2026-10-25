"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { addDaysToDateOnly, diffDaysDateOnly, weekStartOf, WEEKDAY_LABELS } from "@/lib/dates";
import { claimBadge } from "@/lib/actions/economy";
import type { MoveRing, Profile, WeeklyBadge } from "@/lib/supabase/database.types";

export function WeekProgressCard({
  profiles,
  meId,
  today,
  moveRingsThisWeek,
  badgesThisWeek,
  badgeBonus,
  backfillDays,
}: {
  profiles: Profile[];
  meId: string;
  today: string;
  moveRingsThisWeek: MoveRing[];
  badgesThisWeek: WeeklyBadge[];
  badgeBonus: number;
  backfillDays: number;
}) {
  const [pending, startTransition] = useTransition();
  const weekStart = weekStartOf(today);
  const weekEnd = addDaysToDateOnly(weekStart, 6);
  const claimWindowOpen = diffDaysDateOnly(weekEnd, today) >= 0 && diffDaysDateOnly(weekEnd, today) <= backfillDays;

  function handleClaim(personId: string) {
    startTransition(async () => {
      try {
        await claimBadge(personId, weekStart);
        toast.success(`Badge claimed (+${badgeBonus} min)`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Not eligible yet");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>This week&apos;s move rings</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-8 items-center gap-1 text-center text-[11px] text-muted-foreground">
          <span />
          {WEEKDAY_LABELS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        {profiles.map((person) => {
          const days = Array.from({ length: 7 }, (_, i) => addDaysToDateOnly(weekStart, i));
          const tickedCount = days.filter((day) =>
            moveRingsThisWeek.some((r) => r.person_id === person.id && r.day === day && r.ticked),
          ).length;
          const claimed = badgesThisWeek.some((b) => b.person_id === person.id && b.status === "claimed");
          const isSelf = person.id === meId;
          const label = isSelf ? "You" : person.display_name;

          return (
            <div key={person.id} className="flex flex-col gap-2">
              <div className="grid grid-cols-8 items-center gap-1">
                <span className="truncate text-xs font-medium">{label}</span>
                {days.map((day) => {
                  const ticked = moveRingsThisWeek.some(
                    (r) => r.person_id === person.id && r.day === day && r.ticked,
                  );
                  const future = diffDaysDateOnly(today, day) > 0;
                  return (
                    <span
                      key={day}
                      className={cn(
                        "mx-auto size-5 rounded-full border",
                        ticked ? "bg-primary border-primary" : "border-muted-foreground/30",
                        future && "opacity-30",
                      )}
                    />
                  );
                })}
              </div>
              {claimed ? (
                <span className="text-xs text-muted-foreground">Badge claimed this week (+{badgeBonus} min)</span>
              ) : tickedCount === 7 && claimWindowOpen && isSelf ? (
                <Button size="sm" variant="secondary" disabled={pending} onClick={() => handleClaim(person.id)}>
                  Claim 1-week badge (+{badgeBonus} min)
                </Button>
              ) : tickedCount === 7 && claimWindowOpen ? (
                <span className="text-xs text-muted-foreground">Eligible — waiting on {label} to claim</span>
              ) : (
                <span className="text-xs text-muted-foreground">{tickedCount}/7 days ticked</span>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

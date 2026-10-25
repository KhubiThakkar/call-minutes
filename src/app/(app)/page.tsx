import { getDashboardData } from "@/lib/data";
import { BalanceCard } from "@/components/dashboard/balance-card";
import { ChecklistCard } from "@/components/dashboard/checklist-card";
import { WeekProgressCard } from "@/components/dashboard/week-progress-card";
import { PunishmentsCard } from "@/components/dashboard/punishments-card";
import { RecentLedgerCard } from "@/components/dashboard/recent-ledger-card";

export default async function HomePage() {
  const data = await getDashboardData();

  return (
    <div className="flex flex-col gap-4">
      <BalanceCard balance={data.balance} today={data.today} />
      <ChecklistCard
        profiles={data.viewer.profiles}
        meId={data.viewer.me.id}
        today={data.today}
        todaysMoveRings={data.todaysMoveRings}
        todaysWorkouts={data.todaysWorkouts}
        moveRingBonus={data.settings.move_ring_bonus}
        workoutBonus={data.settings.workout_bonus}
      />
      <PunishmentsCard
        punishments={data.openPunishments}
        profiles={data.viewer.profiles}
        meId={data.viewer.me.id}
        today={data.today}
        overdueDays={data.settings.punishment_overdue_days}
        overduePenalty={data.settings.punishment_overdue_penalty}
        targetReps={data.settings.punishment_target_reps}
      />
      <WeekProgressCard
        profiles={data.viewer.profiles}
        meId={data.viewer.me.id}
        today={data.today}
        moveRingsThisWeek={data.moveRingsThisWeek}
        badgesThisWeek={data.badgesThisWeek}
        badgeBonus={data.settings.badge_bonus}
        backfillDays={data.settings.backfill_days}
      />
      <RecentLedgerCard entries={data.recentLedger} profiles={data.viewer.profiles} />
    </div>
  );
}

import { PunishmentCard } from "@/components/punishments/punishment-card";
import { getPunishments, getSettings, getToday, getViewer } from "@/lib/data";

export default async function PunishmentsPage() {
  const [viewer, today, settings, punishments] = await Promise.all([
    getViewer(),
    getToday(),
    getSettings(),
    getPunishments(),
  ]);

  const open = punishments.filter((p) => p.status === "open");
  const history = punishments.filter((p) => p.status !== "open");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="mb-3 text-lg font-semibold">Open punishments</h1>
        <div className="flex flex-col gap-3">
          {open.length === 0 && <p className="text-sm text-muted-foreground">Nothing open. Nicely done.</p>}
          {open.map((p) => (
            <PunishmentCard
              key={p.id}
              punishment={p}
              attempts={p.punishment_attempts}
              person={viewer.profiles.find((pr) => pr.id === p.person_id)}
              isMine={p.person_id === viewer.me.id}
              today={today}
              overdueDays={settings.punishment_overdue_days}
              overduePenalty={settings.punishment_overdue_penalty}
              targetReps={settings.punishment_target_reps}
            />
          ))}
        </div>
      </div>

      {history.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">History</h2>
          <div className="flex flex-col gap-3">
            {history.map((p) => (
              <PunishmentCard
                key={p.id}
                punishment={p}
                attempts={p.punishment_attempts}
                person={viewer.profiles.find((pr) => pr.id === p.person_id)}
                isMine={p.person_id === viewer.me.id}
                today={today}
                overdueDays={settings.punishment_overdue_days}
                overduePenalty={settings.punishment_overdue_penalty}
                targetReps={settings.punishment_target_reps}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

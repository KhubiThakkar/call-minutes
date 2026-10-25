"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSettings } from "@/lib/actions/settings";
import type { AppSettings } from "@/lib/supabase/database.types";

const FIELDS: { key: keyof AppSettings; label: string; step?: string }[] = [
  { key: "daily_credit", label: "Daily credit (min/day, shared)", step: "0.5" },
  { key: "move_ring_bonus", label: "Move ring bonus (min, per person)", step: "0.5" },
  { key: "workout_bonus", label: "Workout bonus (min, per person)", step: "0.5" },
  { key: "badge_bonus", label: "1-week badge bonus (min, per person)", step: "0.5" },
  { key: "punishment_target_reps", label: "Punishment target reps" },
  { key: "punishment_overdue_days", label: "Punishment overdue period (days)" },
  { key: "punishment_overdue_penalty", label: "Overdue penalty (min)", step: "0.5" },
  { key: "backfill_days", label: "Backfill window (days)" },
  { key: "duplicate_tolerance_minutes", label: "Duplicate-call tolerance (min)", step: "0.5" },
];

export function SettingsForm({ settings }: { settings: AppSettings }) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(FIELDS.map((f) => [f.key, String(settings[f.key])])),
  );
  const [timezone, setTimezone] = useState(settings.timezone);
  const [pending, startTransition] = useTransition();

  function submit() {
    const patch: Record<string, number | string> = { timezone };
    for (const f of FIELDS) {
      const n = Number(values[f.key]);
      if (Number.isNaN(n)) {
        toast.error(`${f.label} must be a number`);
        return;
      }
      patch[f.key] = n;
    }
    startTransition(async () => {
      try {
        await updateSettings(patch);
        toast.success("Settings saved");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not save settings");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="timezone">Shared timezone (IANA)</Label>
        <Input id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} placeholder="America/New_York" />
        <p className="text-xs text-muted-foreground">Changing this only affects future day boundaries.</p>
      </div>
      {FIELDS.map((f) => (
        <div key={f.key} className="flex flex-col gap-1.5">
          <Label htmlFor={f.key}>{f.label}</Label>
          <Input
            id={f.key}
            type="number"
            step={f.step ?? "1"}
            value={values[f.key]}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
          />
        </div>
      ))}
      <Button onClick={submit} disabled={pending} className="mt-2">
        Save settings
      </Button>
    </div>
  );
}

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CallFormDialog } from "@/components/calls/call-form-dialog";
import { CallList } from "@/components/calls/call-list";
import { getCalls, getSettings, getToday, getViewer } from "@/lib/data";
import { addDaysToDateOnly } from "@/lib/dates";

export default async function CallsPage() {
  const [viewer, today, settings, calls] = await Promise.all([
    getViewer(),
    getToday(),
    getSettings(),
    getCalls(),
  ]);
  const minDate = addDaysToDateOnly(today, -settings.backfill_days);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Calls</h1>
        <CallFormDialog
          mode="create"
          today={today}
          minDate={minDate}
          trigger={
            <Button size="sm">
              <Plus className="size-4" />
              Log call
            </Button>
          }
        />
      </div>
      <CallList calls={calls} meId={viewer.me.id} today={today} minDate={minDate} />
    </div>
  );
}

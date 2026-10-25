"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Pencil, Trash2, Flag } from "lucide-react";
import { CallFormDialog } from "@/components/calls/call-form-dialog";
import { DisputeDialog } from "@/components/calls/dispute-dialog";
import { deleteCall } from "@/lib/actions/economy";
import { formatDisplayDate } from "@/lib/dates";
import type { Call, Profile } from "@/lib/supabase/database.types";

export function CallList({
  calls,
  meId,
  today,
  minDate,
}: {
  calls: (Call & { logger: Profile })[];
  meId: string;
  today: string;
  minDate: string;
}) {
  const [pending, startTransition] = useTransition();

  function handleDelete(id: string) {
    if (!confirm("Delete this call entry? The deduction will be reversed.")) return;
    startTransition(async () => {
      try {
        await deleteCall(id);
        toast.success("Call deleted");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Could not delete call");
      }
    });
  }

  if (calls.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No calls logged yet.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {calls.map((call) => {
        const deduction = call.bad_day ? call.minutes / 2 : call.minutes;
        return (
          <Card key={call.id}>
            <CardContent className="flex items-start justify-between gap-3 py-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {formatDisplayDate(call.call_date)}
                  {call.backfilled && (
                    <Badge variant="outline" className="text-[10px]">
                      backfilled
                    </Badge>
                  )}
                </div>
                <span className="text-sm text-muted-foreground">
                  {call.minutes} min logged · −{deduction} min · by{" "}
                  {call.logged_by === meId ? "you" : call.logger.display_name}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {call.bad_day && <Badge variant="secondary">Bad day</Badge>}
                  {call.inappropriate && <Badge variant="destructive">Inappropriate</Badge>}
                  {call.disputed && <Badge variant="outline">Disputed</Badge>}
                </div>
                {call.disputed && call.dispute_note && (
                  <p className="text-xs italic text-muted-foreground">&ldquo;{call.dispute_note}&rdquo;</p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <CallFormDialog
                  mode="edit"
                  call={call}
                  today={today}
                  minDate={minDate}
                  trigger={
                    <Button size="icon" variant="ghost" aria-label="Edit call">
                      <Pencil className="size-4" />
                    </Button>
                  }
                />
                <DisputeDialog
                  callId={call.id}
                  trigger={
                    <Button size="icon" variant="ghost" aria-label="Dispute call">
                      <Flag className="size-4" />
                    </Button>
                  }
                />
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Delete call"
                  disabled={pending}
                  onClick={() => handleDelete(call.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

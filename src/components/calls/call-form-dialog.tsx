"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { logCall, editCall } from "@/lib/actions/economy";
import { formatDisplayDate } from "@/lib/dates";
import type { Call, LogCallResult } from "@/lib/supabase/database.types";

interface Props {
  mode: "create" | "edit";
  call?: Call;
  today: string;
  minDate: string;
  trigger: React.ReactNode;
}

export function CallFormDialog({ mode, call, today, minDate, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [callDate, setCallDate] = useState(call?.call_date ?? today);
  const [minutes, setMinutes] = useState(String(call?.minutes ?? ""));
  const [badDay, setBadDay] = useState(call?.bad_day ?? false);
  const [inappropriate, setInappropriate] = useState(call?.inappropriate ?? false);
  const [pending, setPending] = useState(false);
  const [duplicate, setDuplicate] = useState<LogCallResult | null>(null);

  function reset() {
    setCallDate(call?.call_date ?? today);
    setMinutes(String(call?.minutes ?? ""));
    setBadDay(call?.bad_day ?? false);
    setInappropriate(call?.inappropriate ?? false);
    setDuplicate(null);
  }

  async function submit(confirmDuplicate = false) {
    const parsedMinutes = Number(minutes);
    if (!parsedMinutes || parsedMinutes <= 0) {
      toast.error("Enter minutes greater than 0");
      return;
    }
    setPending(true);
    try {
      if (mode === "create") {
        const result = await logCall({
          callDate,
          minutes: parsedMinutes,
          badDay,
          inappropriate,
          confirmDuplicate,
        });
        if (result.warning === "possible_duplicate") {
          setDuplicate(result);
          setPending(false);
          return;
        }
        toast.success("Call logged");
      } else if (call) {
        await editCall({ callId: call.id, minutes: parsedMinutes, badDay, inappropriate });
        toast.success("Call updated");
      }
      setOpen(false);
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Log a call" : "Edit call"}</DialogTitle>
        </DialogHeader>

        {duplicate ? (
          <div className="flex flex-col gap-4">
            <Alert>
              <AlertTitle>Possible duplicate</AlertTitle>
              <AlertDescription>
                Your partner already logged {duplicate.existing_call?.minutes} min on{" "}
                {duplicate.existing_call && formatDisplayDate(duplicate.existing_call.call_date)}. Log this
                anyway, or cancel to avoid double-counting the same call.
              </AlertDescription>
            </Alert>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDuplicate(null)} disabled={pending}>
                Cancel
              </Button>
              <Button onClick={() => submit(true)} disabled={pending}>
                Log anyway
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="call-date">Date</Label>
              <Input
                id="call-date"
                type="date"
                value={callDate}
                min={minDate}
                max={today}
                disabled={mode === "edit"}
                onChange={(e) => setCallDate(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="call-minutes">Minutes</Label>
              <Input
                id="call-minutes"
                type="number"
                min={1}
                step="0.5"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={badDay} onCheckedChange={(c) => setBadDay(c === true)} />
              Bad day (halves the deduction)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={inappropriate} onCheckedChange={(c) => setInappropriate(c === true)} />
              Inappropriate conversation (assigns a punishment to each of you)
            </label>
            <DialogFooter>
              <Button onClick={() => submit(false)} disabled={pending}>
                {mode === "create" ? "Log call" : "Save changes"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

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
import { Textarea } from "@/components/ui/textarea";
import { disputeCall } from "@/lib/actions/economy";

export function DisputeDialog({ callId, trigger }: { callId: string; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    try {
      await disputeCall(callId, note);
      toast.success("Marked as disputed");
      setOpen(false);
      setNote("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not dispute call");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dispute this call</DialogTitle>
        </DialogHeader>
        <Textarea
          placeholder="What looks wrong about this entry?"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <DialogFooter>
          <Button onClick={submit} disabled={pending}>
            Mark as disputed
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

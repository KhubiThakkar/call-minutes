"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { LogCallResult } from "@/lib/supabase/database.types";

function fail(message: string): never {
  throw new Error(message);
}

export async function toggleMoveRing(personId: string, day: string, ticked: boolean) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_toggle_move_ring", {
    p_person_id: personId,
    p_day: day,
    p_ticked: ticked,
  });
  if (error) fail(error.message);
  revalidatePath("/");
}

export async function logWorkout(personId: string, day: string, durationMinutes: 30 | 45) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_log_workout", {
    p_person_id: personId,
    p_day: day,
    p_duration_minutes: durationMinutes,
  });
  if (error) fail(error.message);
  revalidatePath("/");
}

export async function claimBadge(personId: string, weekStart: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_claim_badge", {
    p_person_id: personId,
    p_week_start: weekStart,
  });
  if (error) fail(error.message);
  revalidatePath("/");
}

export async function logCall(input: {
  callDate: string;
  minutes: number;
  badDay: boolean;
  inappropriate: boolean;
  confirmDuplicate?: boolean;
}): Promise<LogCallResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_log_call", {
    p_call_date: input.callDate,
    p_minutes: input.minutes,
    p_bad_day: input.badDay,
    p_inappropriate: input.inappropriate,
    p_confirm_duplicate: input.confirmDuplicate ?? false,
  });
  if (error) fail(error.message);
  revalidatePath("/");
  revalidatePath("/calls");
  return data as LogCallResult;
}

export async function editCall(input: {
  callId: string;
  minutes: number;
  badDay: boolean;
  inappropriate: boolean;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_edit_call", {
    p_call_id: input.callId,
    p_minutes: input.minutes,
    p_bad_day: input.badDay,
    p_inappropriate: input.inappropriate,
  });
  if (error) fail(error.message);
  revalidatePath("/");
  revalidatePath("/calls");
}

export async function deleteCall(callId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_delete_call", { p_call_id: callId });
  if (error) fail(error.message);
  revalidatePath("/");
  revalidatePath("/calls");
}

export async function disputeCall(callId: string, note: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("fn_dispute_call", { p_call_id: callId, p_note: note });
  if (error) fail(error.message);
  revalidatePath("/calls");
}

export async function logPunishmentAttempt(input: {
  punishmentId: string;
  reps: number;
  exerciseType?: "push_ups" | "tricep_curls";
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_log_punishment_attempt", {
    p_punishment_id: input.punishmentId,
    p_reps: input.reps,
    p_exercise_type: input.exerciseType ?? null,
  });
  if (error) fail(error.message);
  revalidatePath("/");
  revalidatePath("/punishments");
  return data;
}

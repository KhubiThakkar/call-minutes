import { createClient } from "@/lib/supabase/server";
import { weekStartOf } from "@/lib/dates";
import type {
  ActivityLogEntry,
  Call,
  MoveRing,
  Profile,
  Punishment,
  Workout,
  WeeklyBadge,
  AppSettings,
} from "@/lib/supabase/database.types";

export interface Viewer {
  me: Profile;
  partner: Profile;
  profiles: Profile[];
}

export async function getViewer(): Promise<Viewer> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("not authenticated");

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const me = profiles.find((p) => p.id === user.id);
  const partner = profiles.find((p) => p.id !== user.id);
  if (!me || !partner) throw new Error("expected exactly two profiles");

  return { me, partner, profiles };
}

export async function getToday(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_today");
  if (error) throw new Error(error.message);
  return data;
}

export async function getSettings(): Promise<AppSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("app_settings").select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function getBalance(): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_get_balance");
  if (error) throw new Error(error.message);
  return data;
}

export interface DashboardData {
  viewer: Viewer;
  today: string;
  settings: AppSettings;
  balance: number;
  moveRingsThisWeek: MoveRing[];
  todaysMoveRings: MoveRing[];
  todaysWorkouts: Workout[];
  badgesThisWeek: WeeklyBadge[];
  openPunishments: (Punishment & { calls: Pick<Call, "id" | "call_date"> })[];
}

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = await createClient();
  const viewer = await getViewer();
  const [today, settings, balance] = await Promise.all([getToday(), getSettings(), getBalance()]);
  const weekStart = weekStartOf(today);

  const [moveRingsRes, workoutsRes, badgesRes, punishmentsRes] = await Promise.all([
    supabase
      .from("move_rings")
      .select("*")
      .gte("day", weekStart)
      .lte("day", today)
      .order("day", { ascending: true }),
    supabase.from("workouts").select("*").eq("day", today),
    supabase.from("weekly_badges").select("*").eq("week_start", weekStart),
    supabase
      .from("punishments")
      .select("*, calls(id, call_date)")
      .eq("status", "open")
      .order("assigned_date", { ascending: true }),
  ]);

  if (moveRingsRes.error) throw new Error(moveRingsRes.error.message);
  if (workoutsRes.error) throw new Error(workoutsRes.error.message);
  if (badgesRes.error) throw new Error(badgesRes.error.message);
  if (punishmentsRes.error) throw new Error(punishmentsRes.error.message);

  return {
    viewer,
    today,
    settings,
    balance,
    moveRingsThisWeek: moveRingsRes.data,
    todaysMoveRings: moveRingsRes.data.filter((r) => r.day === today),
    todaysWorkouts: workoutsRes.data,
    badgesThisWeek: badgesRes.data,
    openPunishments: punishmentsRes.data as unknown as DashboardData["openPunishments"],
  };
}

export async function getCalls(limit = 50): Promise<(Call & { logger: Profile })[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("calls")
    .select("*, logger:profiles!calls_logged_by_fkey(*)")
    .is("deleted_at", null)
    .order("call_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data as unknown as (Call & { logger: Profile })[];
}

export async function getPunishments(): Promise<
  (Punishment & { calls: Pick<Call, "id" | "call_date">; punishment_attempts: { day: string; reps: number }[] })[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("punishments")
    .select("*, calls(id, call_date), punishment_attempts(day, reps)")
    .order("status", { ascending: true })
    .order("assigned_date", { ascending: false });
  if (error) throw new Error(error.message);
  return data as unknown as Awaited<ReturnType<typeof getPunishments>>;
}

export async function getActivityLog(limit = 100): Promise<(ActivityLogEntry & { actor: Profile | null })[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("activity_log")
    .select("*, actor:profiles(*)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data as unknown as (ActivityLogEntry & { actor: Profile | null })[];
}

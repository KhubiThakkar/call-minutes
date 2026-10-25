// Hand-written to match supabase/migrations/0001_init_schema.sql and
// 0002_economy_functions.sql. Regenerate with
// `supabase gen types typescript --local` once the project is linked, and
// diff against this file before replacing it (the RPC return shapes here are
// manually curated for ergonomics; the generator doesn't infer PL/pgSQL
// return types).
//
// NOTE: row/args shapes below are declared with `type`, not `interface`.
// @supabase/postgrest-js checks them against `Record<string, unknown>`
// (GenericTable/GenericFunction), and only object type literals get the
// implicit index signature that check relies on — an `interface` fails it
// silently, collapsing the whole schema to `never` everywhere it's used.

export type LedgerEntryType =
  | "daily_credit"
  | "move_ring"
  | "workout"
  | "badge"
  | "call"
  | "punishment_overdue"
  | "reversal";

export type ExerciseType = "push_ups" | "tricep_curls";
export type PunishmentStatus = "open" | "completed" | "voided";
export type BadgeStatus = "claimed" | "reversed";

export type Profile = {
  id: string;
  display_name: string;
  created_at: string;
};

export type AppSettings = {
  id: true;
  timezone: string;
  daily_credit: number;
  move_ring_bonus: number;
  workout_bonus: number;
  badge_bonus: number;
  punishment_target_reps: number;
  punishment_overdue_days: number;
  punishment_overdue_penalty: number;
  backfill_days: number;
  duplicate_tolerance_minutes: number;
  last_rollover_date: string | null;
  updated_by: string | null;
  updated_at: string;
};

export type LedgerEntry = {
  id: string;
  entry_date: string;
  entry_type: LedgerEntryType;
  amount: number;
  person_id: string | null;
  source_table: string | null;
  source_id: string | null;
  reversal_of: string | null;
  description: string | null;
  created_by: string | null;
  created_at: string;
};

export type MoveRing = {
  id: string;
  person_id: string;
  day: string;
  ticked: boolean;
  backfilled: boolean;
  ledger_entry_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Workout = {
  id: string;
  person_id: string;
  day: string;
  duration_minutes: 30 | 45;
  backfilled: boolean;
  ledger_entry_id: string | null;
  created_by: string | null;
  created_at: string;
};

export type WeeklyBadge = {
  id: string;
  person_id: string;
  week_start: string;
  status: BadgeStatus;
  ledger_entry_id: string | null;
  claimed_at: string;
  reversed_at: string | null;
};

export type Call = {
  id: string;
  call_date: string;
  minutes: number;
  bad_day: boolean;
  inappropriate: boolean;
  logged_by: string;
  backfilled: boolean;
  disputed: boolean;
  dispute_note: string | null;
  disputed_by: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  ledger_entry_id: string | null;
  created_at: string;
  updated_at: string;
};

export type Punishment = {
  id: string;
  call_id: string;
  person_id: string;
  assigned_date: string;
  exercise_type: ExerciseType | null;
  status: PunishmentStatus;
  penalty_count: number;
  completed_at: string | null;
  voided_at: string | null;
  created_at: string;
};

export type PunishmentAttempt = {
  id: string;
  punishment_id: string;
  person_id: string;
  day: string;
  reps: number;
  created_at: string;
};

export type ActivityLogEntry = {
  id: string;
  actor_id: string | null;
  entity_type: string;
  entity_id: string;
  action: string;
  detail: Record<string, unknown> | null;
  created_at: string;
};

export type LogCallResult = {
  warning?: "possible_duplicate";
  existing_call?: Call;
  call?: Call;
  punishments?: Punishment[];
};

export type LogPunishmentAttemptResult = {
  attempt: PunishmentAttempt;
  day_total: number;
  target: number;
  completed: boolean;
};

type NoRelationships = { Relationships: [] };
type ReadOnlyTable<Row> = { Row: Row; Insert: never; Update: never } & NoRelationships;

export type Database = {
  public: {
    Tables: {
      profiles: ReadOnlyTable<Profile>;
      app_settings: {
        Row: AppSettings;
        Insert: never;
        Update: Partial<Omit<AppSettings, "id">>;
      } & NoRelationships;
      ledger_entries: ReadOnlyTable<LedgerEntry>;
      move_rings: ReadOnlyTable<MoveRing>;
      workouts: ReadOnlyTable<Workout>;
      weekly_badges: ReadOnlyTable<WeeklyBadge>;
      calls: ReadOnlyTable<Call>;
      punishments: ReadOnlyTable<Punishment>;
      punishment_attempts: ReadOnlyTable<PunishmentAttempt>;
      activity_log: ReadOnlyTable<ActivityLogEntry>;
    };
    Views: Record<string, never>;
    Functions: {
      fn_today: { Args: Record<string, never>; Returns: string };
      fn_get_balance: { Args: Record<string, never>; Returns: number };
      fn_toggle_move_ring: {
        Args: { p_person_id: string; p_day: string; p_ticked: boolean };
        Returns: MoveRing;
      };
      fn_log_workout: {
        Args: { p_person_id: string; p_day: string; p_duration_minutes: number };
        Returns: Workout;
      };
      fn_claim_badge: {
        Args: { p_person_id: string; p_week_start: string };
        Returns: WeeklyBadge;
      };
      fn_log_call: {
        Args: {
          p_call_date: string;
          p_minutes: number;
          p_bad_day: boolean;
          p_inappropriate: boolean;
          p_confirm_duplicate?: boolean;
        };
        Returns: LogCallResult;
      };
      fn_edit_call: {
        Args: {
          p_call_id: string;
          p_minutes: number;
          p_bad_day: boolean;
          p_inappropriate: boolean;
        };
        Returns: Call;
      };
      fn_delete_call: { Args: { p_call_id: string }; Returns: void };
      fn_dispute_call: { Args: { p_call_id: string; p_note: string }; Returns: Call };
      fn_log_punishment_attempt: {
        Args: { p_punishment_id: string; p_reps: number; p_exercise_type?: string | null };
        Returns: LogPunishmentAttemptResult;
      };
    };
    Enums: {
      ledger_entry_type: LedgerEntryType;
    };
  };
};

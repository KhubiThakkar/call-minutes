"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { AppSettings } from "@/lib/supabase/database.types";

export async function updateSettings(patch: Partial<Omit<AppSettings, "id" | "updated_at" | "updated_by">>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("app_settings")
    .update({ ...patch, updated_by: user?.id, updated_at: new Date().toISOString() })
    .eq("id", true);

  if (error) throw new Error(error.message);
  revalidatePath("/settings");
  revalidatePath("/");
}

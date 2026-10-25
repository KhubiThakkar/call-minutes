// Creates the two allow-listed accounts via the Supabase Admin API.
// Run once per environment (local or hosted):
//
//   node --env-file=.env.local scripts/seed-users.mjs
//
// Public sign-up must stay disabled afterwards (supabase/config.toml locally
// sets [auth] enable_signup = false; on the hosted project, turn it off in
// Authentication > Settings) so these remain the only two accounts.

import { createClient } from "@supabase/supabase-js";

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PERSON_A_EMAIL",
  "PERSON_A_PASSWORD",
  "PERSON_A_NAME",
  "PERSON_B_EMAIL",
  "PERSON_B_PASSWORD",
  "PERSON_B_NAME",
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`Missing required env var: ${key}`);
    process.exit(1);
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function ensureUser(email, password, displayName) {
  const { data: existing, error: listError } = await supabase.auth.admin.listUsers();
  if (listError) throw listError;

  const found = existing.users.find((u) => u.email === email);
  if (found) {
    console.log(`Already exists: ${email}`);
    return found;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error) throw error;

  console.log(`Created: ${email}`);
  return data.user;
}

await ensureUser(process.env.PERSON_A_EMAIL, process.env.PERSON_A_PASSWORD, process.env.PERSON_A_NAME);
await ensureUser(process.env.PERSON_B_EMAIL, process.env.PERSON_B_PASSWORD, process.env.PERSON_B_NAME);

console.log("Done. Confirm public sign-up is disabled on this project.");

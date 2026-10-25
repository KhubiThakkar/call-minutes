// Scheduled job: posts the daily credit (E1) and any overdue punishment
// penalties (E7). Invoked by pg_cron (see migration 0003) once a day, plus
// safe to trigger manually/idempotently (e.g. for local testing):
//
//   curl -X POST "$SUPABASE_URL/functions/v1/rollover" \
//     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
//
// Business logic lives entirely in the fn_run_daily_rollover() Postgres
// function (idempotent, catches up missed days); this function is just the
// HTTP entrypoint pg_cron can reach via net.http_post, running with the
// service role so it bypasses RLS and the client-only RPC grants.

import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.headers.get("Authorization") !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) {
    return new Response("unauthorized", { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase.rpc("fn_run_daily_rollover");

  if (error) {
    console.error("rollover failed", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }

  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
});

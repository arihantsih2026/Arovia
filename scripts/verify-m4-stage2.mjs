import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

// Load environment variables manually
const envPath = path.resolve(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  console.error("❌ .env.local not found in project root.");
  process.exit(1);
}

const env = fs.readFileSync(envPath, "utf-8");
const NEXT_PUBLIC_SUPABASE_URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const NEXT_PUBLIC_SUPABASE_ANON_KEY = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

if (!NEXT_PUBLIC_SUPABASE_URL || !NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.error("❌ Missing Supabase environment variables in .env.local");
  process.exit(1);
}

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);

const CITY_EMAIL = "arovia.city.demo@gmail.com";
const STATE_EMAIL = "arovia.state.demo@gmail.com";
const TEST_PASS = "Dhaval@2602";

async function verify() {
  console.log("==========================================");
  console.log("M4 STAGE 2 — SCENARIO & ACTION PLAN AUTHORING VERIFICATION");
  console.log("==========================================\n");

  let allPassed = true;

  // 1. Test City Official
  console.log("▶ Authenticating as City Official (Mumbai)...");
  const { data: cityAuth, error: cityAuthErr } = await supabase.auth.signInWithPassword({
    email: CITY_EMAIL,
    password: TEST_PASS,
  });

  if (cityAuthErr) {
    console.error("  ❌ City auth failed:", cityAuthErr.message);
    allPassed = false;
  } else {
    console.log("  ✅ Authenticated as City Official.");

    // Define a polygon that covers Rudraprayag (roughly) as a WKT string
    const validPolygon = "POLYGON((79.0 30.6, 79.1 30.6, 79.1 30.7, 79.0 30.7, 79.0 30.6))";

    console.log("▶ Attempting to insert a valid scenario (intersects Rudraprayag)...");
    const { data: validScenario, error: validScenarioErr } = await supabase
      .from("scenarios")
      .insert({
        name: "Test Cyclone Warning - Rudraprayag",
        description: "Test scenario",
        hazard_type: "cyclone",
        severity: 4,
        affected_area: validPolygon
      })
      .select()
      .single();

    if (validScenarioErr) {
      console.error("  ❌ Failed to insert valid scenario:", validScenarioErr.message);
      allPassed = false;
    } else {
      console.log("  ✅ Successfully inserted valid scenario.");

      console.log("▶ Attempting to insert action plan for valid scenario...");
      const { error: actionPlanErr } = await supabase
        .from("action_plans")
        .insert({
          scenario_id: validScenario.id,
          action: "Deploy local teams",
          priority: 1
        });

      if (actionPlanErr) {
        console.error("  ❌ Failed to insert action plan:", actionPlanErr.message);
        allPassed = false;
      } else {
        console.log("  ✅ Successfully inserted action plan.");
      }

      // Cleanup
      await supabase.from("scenarios").delete().eq("id", validScenario.id);
    }

    // Define a polygon outside Mumbai (e.g. Delhi) as a WKT string
    const outsidePolygon = "POLYGON((77.0 28.0, 77.5 28.0, 77.5 28.5, 77.0 28.5, 77.0 28.0))";

    console.log("▶ Attempting to insert an OUT-OF-SCOPE scenario (Delhi)...");
    const { error: outOfScopeErr } = await supabase
      .from("scenarios")
      .insert({
        name: "Test Cyclone Warning - Delhi",
        description: "Should fail",
        hazard_type: "cyclone",
        severity: 4,
        affected_area: outsidePolygon
      });

    if (outOfScopeErr) {
      console.log("  ✅ Denied as expected (RLS working).");
    } else {
      console.error("  ❌ SECURITY FAILURE: Allowed out-of-scope scenario insertion.");
      allPassed = false;
    }

    await supabase.auth.signOut();
  }

  console.log("\n==========================================");
  if (allPassed) {
    console.log("✅ M4 STAGE 2 VERIFICATION PASSED");
  } else {
    console.log("❌ M4 STAGE 2 VERIFICATION FAILED");
  }
  console.log("==========================================");
}

verify().catch(console.error);

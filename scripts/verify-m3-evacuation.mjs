import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase environment variables.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function loginAsRole(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    console.error(`Login failed for ${email}:`, error.message);
    process.exit(1);
  }
  return data.session;
}

async function verifyEvacuationIntelligence(email, password, roleDescription) {
  console.log(`\n--- Verifying M3 Stage 3 (Evacuation) for: ${roleDescription} ---`);
  await loginAsRole(email, password);

  // 1. Fetch available scenarios
  const { data: scenarios, error: fetchError } = await supabase.from("scenarios").select("*");
  if (fetchError) {
    console.error("Failed to fetch scenarios:", fetchError.message);
    return;
  }

  if (!scenarios || scenarios.length === 0) {
    console.log("No scenarios accessible for this role.");
    return;
  }

  console.log(`Accessible Scenarios: ${scenarios.length}`);

  for (const scenario of scenarios) {
    console.log(`\nScenario: ${scenario.name} (${scenario.id})`);
    
    const { data: intel, error: rpcError } = await supabase.rpc("get_scenario_intelligence", {
      p_scenario_id: scenario.id,
    });

    if (rpcError) {
      console.error("  -> RPC Error:", rpcError.message);
      continue;
    }

    if (!intel || !intel.evacuationPlans) {
      console.error("  -> Missing evacuationPlans in intelligence payload.");
      continue;
    }

    const { evacuationPlans, habitations } = intel;
    console.log(`  -> Affected Habitations: ${habitations.length}`);
    console.log(`  -> Evacuation Plans Generated: ${evacuationPlans.length}`);

    if (habitations.length !== evacuationPlans.length) {
      console.warn("  -> WARNING: Evacuation plans count doesn't match affected habitations.");
    }

    evacuationPlans.forEach(plan => {
      console.log(`    Habitation: ${plan.habitation.name}`);
      console.log(`    Candidates Found: ${plan.candidates.length}`);
      
      plan.candidates.forEach((candidate, idx) => {
        console.log(`      ${idx === 0 ? '[PRIMARY]' : '[BACKUP] '} ${candidate.site_name}`);
        console.log(`        Distance: ${(candidate.distance_meters / 1000).toFixed(2)} km`);
        if (candidate.route_id) {
          console.log(`        Route Found: Yes (${candidate.route_distance} km, Time: ${candidate.route_time})`);
        } else {
          console.log(`        Route Found: No (Intelligence unavailable)`);
        }
      });
    });
  }
}

async function run() {
  console.log("Starting M3 Stage 3 (Evacuation Intelligence) Verification...\n");
  
  await verifyEvacuationIntelligence("arovia.public.demo@gmail.com", process.env.AROVIA_PUBLIC_PASSWORD, "Public Citizen");
  await verifyEvacuationIntelligence("arovia.city.demo@gmail.com", process.env.AROVIA_CITY_PASSWORD, "City Official (South 24 Parganas)");
  await verifyEvacuationIntelligence("arovia.state.demo@gmail.com", process.env.AROVIA_STATE_PASSWORD, "State Official (Odisha)");
  
  console.log("\nVerification Complete.");
}

run();

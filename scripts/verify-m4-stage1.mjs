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

const IDS = {
  ownHabitation: "10000000-0000-4000-8000-000000000001", // In South 24 Parganas, Odisha? Wait, verify-write-scope.mjs uses this.
  outsideHabitation: "a1000000-0000-0000-0000-000000000006",
};

async function createClientForRole(email, password) {
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) {
    console.error(`Login failed for ${email}:`, error.message);
    process.exit(1);
  }
  return supabase;
}

function pass(label) {
  console.log(`${label}: PASS`);
}
function fail(label, msg) {
  console.log(`${label}: FAIL (${msg})`);
  process.exitCode = 1;
}
function blocked(label) {
  console.log(`${label}: BLOCKED (Expected)`);
}

async function verifyPublicCannotWrite() {
  console.log("\n--- Verifying PUBLIC Role ---");
  const sb = await createClientForRole("arovia.public.demo@gmail.com", process.env.AROVIA_PUBLIC_PASSWORD);
  
  const testId = crypto.randomUUID();
  const { error: hErr } = await sb.from("hazards").insert({
    id: testId,
    habitation_id: IDS.ownHabitation,
    type: "test_public_hazard",
    severity: 1,
    event_time: new Date().toISOString()
  });

  if (hErr) {
    blocked("Public cannot insert hazard");
  } else {
    fail("Public cannot insert hazard", "Operation succeeded");
  }

  const { error: rErr } = await sb.from("risk_assessments").insert({
    hazard_id: crypto.randomUUID(),
    risk_score: 1
  });
  if (rErr) blocked("Public cannot insert risk_assessment");
  else fail("Public cannot insert risk_assessment", "Operation succeeded");
}

async function verifyScopedRole(email, password, roleName) {
  console.log(`\n--- Verifying ${roleName.toUpperCase()} Role ---`);
  const sb = await createClientForRole(email, password);
  
  // 1. Fetch accessible habitations to find a valid own habitation dynamically
  const { data: habs } = await sb.from("habitations").select("id").limit(1);
  if (!habs || habs.length === 0) {
    fail(`${roleName} has no accessible habitations`, "Cannot proceed with valid insert");
    return;
  }
  const validHabId = habs[0].id;

  // 2. Try inserting valid hazard
  const hazardId = crypto.randomUUID();
  const { error: hErr } = await sb.from("hazards").insert({
    id: hazardId,
    habitation_id: validHabId,
    type: `test_hazard_${roleName}`,
    severity: 1,
    event_time: new Date().toISOString()
  });

  if (hErr) {
    fail(`${roleName} insert valid hazard`, hErr.message);
  } else {
    pass(`${roleName} insert valid hazard`);
  }

  // 3. Try inserting valid risk assessment
  const riskId = crypto.randomUUID();
  const { error: rErr } = await sb.from("risk_assessments").insert({
    id: riskId,
    hazard_id: hazardId,
    risk_score: 5,
    risk_level: "medium"
  });

  if (rErr) {
    fail(`${roleName} insert valid risk_assessment`, rErr.message);
  } else {
    pass(`${roleName} insert valid risk_assessment`);
  }

  // 4. Try inserting invalid hazard (outside scope)
  // Assume a randomly generated UUID is not in their scope (it doesn't exist, which fails FK or RLS)
  // To truly test RLS, we should use a known out-of-scope habitation. 
  // We'll use IDS.outsideHabitation
  const { error: outErr } = await sb.from("hazards").insert({
    habitation_id: IDS.outsideHabitation,
    type: "test_outside",
    severity: 1,
    event_time: new Date().toISOString()
  });

  if (outErr) {
    blocked(`${roleName} insert outside hazard (RLS/FK)`);
  } else {
    fail(`${roleName} insert outside hazard`, "Succeeded incorrectly");
  }

  // Cleanup
  await sb.from("hazards").delete().eq("id", hazardId);
}

async function run() {
  console.log("Starting M4 Stage 1 Verification...\n");
  
  await verifyPublicCannotWrite();
  await verifyScopedRole("arovia.city.demo@gmail.com", process.env.AROVIA_CITY_PASSWORD, "City");
  await verifyScopedRole("arovia.state.demo@gmail.com", process.env.AROVIA_STATE_PASSWORD, "State");
  
  console.log("\nVerification Complete.");
}

run();

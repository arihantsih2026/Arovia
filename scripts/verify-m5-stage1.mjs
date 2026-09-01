import { createClient } from '@supabase/supabase-js';
import fs from "fs";
import path from "path";

// Load environment variables manually
const envPath = path.resolve(process.cwd(), ".env.local");
if (!fs.existsSync(envPath)) {
  console.error("❌ .env.local not found in project root.");
  process.exit(1);
}

const env = fs.readFileSync(envPath, "utf-8");
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const anonKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

if (!url || !anonKey) {
    throw new Error('Missing Supabase URL or anon key');
}

const users = [
    {
        name: 'PUBLIC',
        email: 'arovia.public.demo@gmail.com',
        password: 'Dhaval@2602',
    },
    {
        name: 'CITY',
        email: 'arovia.city.demo@gmail.com',
        password: 'Dhaval@2602',
    },
    {
        name: 'STATE',
        email: 'arovia.state.demo@gmail.com',
        password: 'Dhaval@2602',
    }
];

async function signIn(user) {
    const supabase = createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: user.password,
    });
    if (error) throw new Error(`${user.name} sign-in failed: ${error.message}`);
    return supabase;
}

async function verify() {
    let allPassed = true;
    console.log("==========================================");
    console.log("M5 STAGE 1 VERIFICATION (INCIDENT LIFECYCLE & EXECUTION)");
    console.log("==========================================\n");

    const publicClient = await signIn(users[0]);
    const cityClient = await signIn(users[1]);
    const stateClient = await signIn(users[2]);

    const validPolygon = "POLYGON((79.0 30.6, 79.1 30.6, 79.1 30.7, 79.0 30.7, 79.0 30.6))";

    console.log("▶ Setting up test data as CITY...");
    const { data: testScenario, error: tsErr } = await cityClient
        .from('scenarios')
        .insert({
            name: 'M5 Stage 1 Test Scenario',
            hazard_type: 'flood',
            affected_area: validPolygon
        }).select().single();

    if (tsErr) throw tsErr;

    const { data: testActionPlan, error: apErr } = await cityClient
        .from('action_plans')
        .insert({
            scenario_id: testScenario.id,
            action: 'Test action plan for M5'
        }).select().single();
    
    if (apErr) throw apErr;

    // ---------------------------------------------------------
    // PUBLIC TESTS
    // ---------------------------------------------------------
    console.log("\n▶ PUBLIC ROLE TESTS");
    const { data: pubScenarios } = await publicClient.from('scenarios').select('id');
    if (pubScenarios && pubScenarios.length > 0) {
        console.log("  ✅ Can read scenarios");
    } else {
        console.error("  ❌ Failed to read scenarios");
        allPassed = false;
    }

    const { data: pScenUpdateData, error: pScenUpdateErr } = await publicClient.from('scenarios').update({ status: 'resolved' }).eq('id', testScenario.id).select();
    if (!pScenUpdateErr && pScenUpdateData && pScenUpdateData.length === 0) {
        console.log("  ✅ Cannot update scenario status (RLS enforced)");
    } else {
        console.error("  ❌ SECURITY FAILURE: Public updated scenario status", pScenUpdateErr || "Row was updated");
        allPassed = false;
    }

    // ---------------------------------------------------------
    // CITY TESTS
    // ---------------------------------------------------------
    console.log("\n▶ CITY ROLE TESTS");
    const { data: cScenUpdateData, error: cScenUpdateErr } = await cityClient.from('scenarios').update({ status: 'resolved' }).eq('id', testScenario.id).select();
    if (cScenUpdateData && cScenUpdateData.length > 0 && !cScenUpdateErr) {
        console.log("  ✅ Can update in-scope scenario");
    } else {
        console.error("  ❌ Failed to update in-scope scenario:", cScenUpdateErr?.message || "0 rows updated (RLS blocked)");
        allPassed = false;
    }

    const { data: cAPUpdateData, error: cAPUpdateErr } = await cityClient.from('action_plans').update({ status: 'in_progress' }).eq('id', testActionPlan.id).select();
    if (cAPUpdateData && cAPUpdateData.length > 0 && !cAPUpdateErr) {
        console.log("  ✅ Can update in-scope action plan");
    } else {
        console.error("  ❌ Failed to update in-scope action plan:", cAPUpdateErr?.message || "0 rows updated (RLS blocked)");
        allPassed = false;
    }

    // ---------------------------------------------------------
    // STATE TESTS
    // ---------------------------------------------------------
    console.log("\n▶ STATE ROLE TESTS");
    const { data: sScenData, error: sScenUpdateErr } = await stateClient.from('scenarios').update({ status: 'archived' }).eq('id', testScenario.id).select();
    if (sScenData && sScenData.length > 0 && !sScenUpdateErr) {
        console.log("  ✅ Can update in-scope scenario");
    } else {
        console.error("  ❌ Failed to update in-scope scenario (State):", sScenUpdateErr?.message);
        allPassed = false;
    }

    const { data: sAPData, error: sAPUpdateErr } = await stateClient.from('action_plans').update({ status: 'completed' }).eq('id', testActionPlan.id).select();
    if (sAPData && sAPData.length > 0 && !sAPUpdateErr) {
        console.log("  ✅ Can update in-scope action plan");
    } else {
        console.error("  ❌ Failed to update in-scope action plan (State):", sAPUpdateErr?.message);
        allPassed = false;
    }

    // ---------------------------------------------------------
    // DATABASE CONSTRAINTS
    // ---------------------------------------------------------
    console.log("\n▶ DATABASE CONSTRAINTS TESTS");
    const { error: checkScenErr } = await stateClient.from('scenarios').update({ status: 'invalid_status' }).eq('id', testScenario.id);
    if (checkScenErr && checkScenErr.code === '23514') {
        console.log("  ✅ PostgreSQL rejected invalid scenario status");
    } else {
        console.error("  ❌ Failed to reject invalid scenario status or wrong error code:", checkScenErr);
        allPassed = false;
    }

    const { error: checkAPErr } = await stateClient.from('action_plans').update({ status: 'invalid_status' }).eq('id', testActionPlan.id);
    if (checkAPErr && checkAPErr.code === '23514') {
        console.log("  ✅ PostgreSQL rejected invalid action plan status");
    } else {
        console.error("  ❌ Failed to reject invalid action plan status or wrong error code:", checkAPErr);
        allPassed = false;
    }

    console.log("\n==========================================");
    if (allPassed) {
        console.log("✅ M5 STAGE 1 VERIFICATION PASSED");
    } else {
        console.log("❌ M5 STAGE 1 VERIFICATION FAILED");
    }
    console.log("==========================================");
}

verify().catch(console.error);

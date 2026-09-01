import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Missing Supabase environment variables");
  process.exit(1);
}

const USERS = {
  public: { email: 'arovia.public.demo@gmail.com', password: process.env.AROVIA_PUBLIC_PASSWORD },
  city: { email: 'arovia.city.demo@gmail.com', password: process.env.AROVIA_CITY_PASSWORD },
  state: { email: 'arovia.state.demo@gmail.com', password: process.env.AROVIA_STATE_PASSWORD },
};

async function testActionPlans() {
  console.log("=========================================");
  console.log("M3 STAGE 2: ACTION PLANS VERIFICATION");
  console.log("=========================================\n");

  const client = createClient(supabaseUrl, supabaseAnonKey);

  for (const [role, creds] of Object.entries(USERS)) {
    console.log(`\n--- Testing Role: ${role.toUpperCase()} ---`);
    
    const { error: signInError } = await client.auth.signInWithPassword({
      email: creds.email,
      password: creds.password,
    });

    if (signInError) {
      console.error(`Failed to sign in as ${role}:`, signInError.message);
      continue;
    }

    // 1. Fetch Scenario Intelligence to verify actionPlans is populated
    // We'll use the 'Cyclone Remal Landfall' scenario ID
    const SCENARIO_ID = '71000000-0000-0000-0000-000000000001';
    
    console.log(`Executing get_scenario_intelligence for ${SCENARIO_ID}...`);
    const { data: intelligenceData, error: intelligenceError } = await client.rpc('get_scenario_intelligence', {
      p_scenario_id: SCENARIO_ID
    });

    if (intelligenceError) {
      console.error(`❌ RPC Error for ${role}:`, intelligenceError.message);
    } else if (intelligenceData) {
      const actionPlans = intelligenceData.actionPlans;
      if (Array.isArray(actionPlans) && actionPlans.length > 0) {
        console.log(`✅ RPC Success: Retrieved ${actionPlans.length} action plans`);
        console.log(`   Sample Plan: [Priority ${actionPlans[0].priority}] ${actionPlans[0].action}`);
      } else {
        console.error(`❌ RPC Success but no action plans found.`);
      }
    } else {
      console.error(`❌ RPC returned no data.`);
    }

    // 2. Test Write Protection on action_plans
    console.log(`Testing write protection on action_plans...`);
    const { error: insertError } = await client
      .from('action_plans')
      .insert({
        scenario_id: SCENARIO_ID,
        action: 'Test rogue action',
        priority: 1
      });

    if (insertError && insertError.code === '42501') {
       console.log(`✅ Write blocked successfully (RLS Policy Enforcement)`);
    } else if (!insertError) {
       console.error(`❌ SECURITY BREACH: Write succeeded for role ${role}!`);
    } else {
       console.error(`❌ Unexpected error testing write block:`, insertError.message);
    }

    await client.auth.signOut();
  }

  console.log("\n=========================================");
  console.log("VERIFICATION COMPLETE");
  console.log("=========================================\n");
}

testActionPlans().catch(console.error);

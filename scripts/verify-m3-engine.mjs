import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
    throw new Error('Missing Supabase URL or anon key');
}

const users = [
    {
        name: 'PUBLIC',
        email: 'arovia.public.demo@gmail.com',
        password: process.env.AROVIA_PUBLIC_PASSWORD
    },
    {
        name: 'CITY',
        email: 'arovia.city.demo@gmail.com',
        password: process.env.AROVIA_CITY_PASSWORD
    },
    {
        name: 'STATE',
        email: 'arovia.state.demo@gmail.com',
        password: process.env.AROVIA_STATE_PASSWORD
    }
];

async function runTest(user) {
    const supabase = createClient(url, anonKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    });

    console.log(`\n===== ${user.name} USER =====`);

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: user.password
    });

    if (authError) {
        console.log(`SIGN-IN: FAIL - ${authError.message}`);
        return;
    }

    console.log('SIGN-IN: PASS');
    
    // Fetch user's profile to understand their scope
    const { data: profile } = await supabase.from('profiles').select('*').eq('id', authData.user.id).single();
    console.log(`ROLE: ${profile.role} | CITY: ${profile.city_id} | STATE: ${profile.state_id}`);

    // Get a scenario
    const { data: scenarios, error: scenariosError } = await supabase.from('scenarios').select('id, name');
    if (scenariosError || !scenarios || scenarios.length === 0) {
        console.log('SCENARIO READ: FAIL - Could not fetch scenarios');
        return;
    }
    const scenario = scenarios[0];
    console.log(`Selected Scenario: ${scenario.name}`);

    // Call intelligence engine RPC
    const { data: intelligence, error: engineError } = await supabase.rpc('get_scenario_intelligence', {
        p_scenario_id: scenario.id
    });

    if (engineError) {
        console.log(`ENGINE EXECUTION: FAIL - ${engineError.message}`);
        return;
    }
    
    console.log('ENGINE EXECUTION: PASS');

    if (!intelligence) {
        console.log('INTELLIGENCE RETURNED NULL');
        return;
    }

    const { habitations, hazards, riskAssessments, alerts, resources } = intelligence;

    console.log(`- Affected Habitations: ${habitations.length}`);
    console.log(`- Related Hazards: ${hazards.length}`);
    console.log(`- Risk Assessments: ${riskAssessments.length}`);
    console.log(`- Active Relevant Alerts: ${alerts.length}`);
    console.log(`- Available Resources: ${resources.length}`);

    // Verify RLS logic based on role
    let rlsPass = true;
    if (profile.role === 'city') {
        const outOfScope = habitations.some(h => h.district !== profile.city_id);
        if (outOfScope) {
            console.log('RLS VERIFICATION: FAIL - City user saw habitations outside their district');
            rlsPass = false;
        }
    } else if (profile.role === 'state') {
        const outOfScope = habitations.some(h => h.state !== profile.state_id);
        if (outOfScope) {
            console.log('RLS VERIFICATION: FAIL - State user saw habitations outside their state');
            rlsPass = false;
        }
    }
    
    if (rlsPass) {
        console.log('RLS VERIFICATION: PASS');
    }

    await supabase.auth.signOut();
}

(async () => {
    for (const user of users) {
        await runTest(user);
    }
    console.log('\n===== M3 SCENARIO ENGINE TEST COMPLETE =====');
})();

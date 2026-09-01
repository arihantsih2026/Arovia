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

for (const user of users) {
    if (!user.password) {
        throw new Error(`Missing password for ${user.name}`);
    }
}

async function runTest(user) {
    const supabase = createClient(url, anonKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    });

    console.log(`\n===== ${user.name} USER =====`);

    const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
            email: user.email,
            password: user.password
        });

    if (authError) {
        console.log(`SIGN-IN: FAIL - ${authError.message}`);
        return;
    }

    console.log('SIGN-IN: PASS');
    console.log(`AUTH UID: ${authData.user.id}`);

    // ------------------------------------------------------------
    // 1. Read own profile
    // ------------------------------------------------------------

    const { data: beforeProfile, error: beforeError } =
        await supabase
            .from('profiles')
            .select('id, full_name, role, city_id, state_id')
            .eq('id', authData.user.id)
            .single();

    if (beforeError) {
        console.log(`PROFILE READ: FAIL - ${beforeError.message}`);
        await supabase.auth.signOut();
        return;
    }

    console.log('PROFILE READ: PASS');
    console.log(`ROLE BEFORE: ${beforeProfile.role}`);
    console.log(`CITY BEFORE: ${beforeProfile.city_id ?? 'null'}`);
    console.log(`STATE BEFORE: ${beforeProfile.state_id ?? 'null'}`);

    // ------------------------------------------------------------
    // 2. Attempt role escalation/change
    // ------------------------------------------------------------

    const attemptedRole =
        beforeProfile.role === 'state' ? 'public' : 'state';

    const { error: roleUpdateError } =
        await supabase
            .from('profiles')
            .update({ role: attemptedRole })
            .eq('id', authData.user.id);

    if (roleUpdateError) {
        console.log('PROFILE ROLE CHANGE: BLOCKED');
    } else {
        console.log(
            'PROFILE ROLE CHANGE REQUEST: ACCEPTED BY API — VERIFYING DATABASE'
        );
    }

    // Re-read the profile through the authenticated session.
    const { data: afterProfile, error: afterError } =
        await supabase
            .from('profiles')
            .select('role, city_id, state_id')
            .eq('id', authData.user.id)
            .single();

    if (afterError) {
        console.log(`PROFILE RECHECK: FAIL - ${afterError.message}`);
    } else if (afterProfile.role === beforeProfile.role) {
        console.log('PROFILE ROLE IMMUTABILITY: PASS');
    } else {
        console.log(
            `PROFILE ROLE IMMUTABILITY: FAIL — changed from ${beforeProfile.role} to ${afterProfile.role}`
        );
    }

    // ------------------------------------------------------------
    // 3. Attempt habitation INSERT
    // ------------------------------------------------------------

    const { data: habitationData, error: habitationError } =
        await supabase
            .from('habitations')
            .insert({
                name: `RLS TEST ${user.name}`,
                district: 'RLS_TEST',
                state: 'RLS_TEST',
                population: 0
            })
            .select('id');

    if (habitationError || !habitationData?.length) {
        console.log('HABITATION INSERT: BLOCKED');
    } else {
        console.log('HABITATION INSERT: FAIL — INSERT SUCCEEDED');

        // Cleanup only if an unauthorized insert somehow succeeded.
        await supabase
            .from('habitations')
            .delete()
            .eq('id', habitationData[0].id);
    }

    // ------------------------------------------------------------
    // 4. Attempt alert INSERT
    // ------------------------------------------------------------

    const { data: alertData, error: alertError } =
        await supabase
            .from('alerts')
            .insert({
                title: `RLS TEST ${user.name}`,
                message: 'RLS behavioral test',
                severity: 1,
                audience: 'public'
            })
            .select('id');

    if (alertError || !alertData?.length) {
        console.log('ALERT INSERT: BLOCKED');
    } else {
        console.log('ALERT INSERT: FAIL — INSERT SUCCEEDED');

        // Cleanup only if an unauthorized insert somehow succeeded.
        await supabase
            .from('alerts')
            .delete()
            .eq('id', alertData[0].id);
    }

    await supabase.auth.signOut();
}

for (const user of users) {
    await runTest(user);
}

console.log('\n===== RLS TEST COMPLETE =====');
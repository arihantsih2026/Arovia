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

const TEST_IDS = {
    cityHabitation: '10000000-0000-4000-8000-000000000001', // Gaurikund
    outsideCityHabitation: 'a1000000-0000-0000-0000-000000000006', // Erasama
    stateHabitation: '10000000-0000-4000-8000-000000000001', // Gaurikund
    outsideStateHabitation: 'a1000000-0000-0000-0000-000000000006', // Erasama

    cityHazard: '20000000-0000-4000-8000-000000000001',
    outsideCityHazard: 'b1000000-0000-0000-0000-000000000006',

    cityRisk: '30000000-0000-4000-8000-000000000001',
    outsideCityRisk: 'c1000000-0000-0000-0000-000000000006'
};

function pass(label) {
    console.log(`${label}: PASS`);
}

function fail(label, detail = '') {
    console.log(`${label}: FAIL${detail ? ` — ${detail}` : ''}`);
}

async function signIn(user) {
    const supabase = createClient(url, anonKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false
        }
    });

    const { data, error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: user.password
    });

    if (error) {
        throw new Error(`${user.name} sign-in failed: ${error.message}`);
    }

    return supabase;
}

async function testHabitationScope(supabase, name, role) {
    console.log('\n--- HABITATION SCOPE ---');

    const { data, error } = await supabase
        .from('habitations')
        .select('id, name, district, state')
        .in('id', [
            TEST_IDS.cityHabitation,
            TEST_IDS.outsideCityHabitation
        ]);

    if (error) {
        fail(`${name} habitation SELECT`, error.message);
        return;
    }

    const rows = data ?? [];

    if (role === 'public') {
        if (rows.length === 2) {
            pass(`${name} can read public habitation data`);
        } else {
            fail(`${name} public habitation visibility`, `returned ${rows.length}/2`);
        }
        return;
    }

    const hasOwn = rows.some(
        row => row.id === TEST_IDS.cityHabitation
    );

    const hasOutside = rows.some(
        row => row.id === TEST_IDS.outsideCityHabitation
    );

    if (hasOwn) {
        pass(`${name} can read permitted habitation`);
    } else {
        fail(`${name} permitted habitation access`);
    }

    if (!hasOutside) {
        pass(`${name} cannot read outside habitation`);
    } else {
        fail(`${name} outside habitation isolation`);
    }
}

async function testHazardScope(supabase, name, role) {
    console.log('\n--- HAZARD SCOPE ---');

    const { data, error } = await supabase
        .from('hazards')
        .select('id, habitation_id, type, severity')
        .in('id', [
            TEST_IDS.cityHazard,
            TEST_IDS.outsideCityHazard
        ]);

    if (error) {
        fail(`${name} hazard SELECT`, error.message);
        return;
    }

    const rows = data ?? [];

    if (role === 'public') {
        if (rows.length === 2) {
            pass(`${name} can read public hazard data`);
        } else {
            fail(`${name} public hazard visibility`, `returned ${rows.length}/2`);
        }
        return;
    }

    const hasOwn = rows.some(
        row => row.id === TEST_IDS.cityHazard
    );

    const hasOutside = rows.some(
        row => row.id === TEST_IDS.outsideCityHazard
    );

    if (hasOwn) {
        pass(`${name} can read permitted hazard`);
    } else {
        fail(`${name} permitted hazard access`);
    }

    if (!hasOutside) {
        pass(`${name} cannot read outside hazard`);
    } else {
        fail(`${name} outside hazard isolation`);
    }
}

async function testRiskScope(supabase, name, role) {
    console.log('\n--- RISK ASSESSMENT SCOPE ---');

    const { data, error } = await supabase
        .from('risk_assessments')
        .select('id, hazard_id')
        .in('id', [
            TEST_IDS.cityRisk,
            TEST_IDS.outsideCityRisk
        ]);

    if (error) {
        fail(`${name} risk assessment SELECT`, error.message);
        return;
    }

    const rows = data ?? [];

    if (role === 'public') {
        if (rows.length === 2) {
            pass(`${name} can read public risk data`);
        } else {
            fail(
                `${name} public risk visibility`,
                `returned ${rows.length}/2`
            );
        }
        return;
    }

    const hasOwn = rows.some(
        row => row.id === TEST_IDS.cityRisk
    );

    const hasOutside = rows.some(
        row => row.id === TEST_IDS.outsideCityRisk
    );

    if (hasOwn) {
        pass(`${name} can read permitted risk assessment`);
    } else {
        fail(`${name} permitted risk assessment access`);
    }

    if (!hasOutside) {
        pass(`${name} cannot read outside risk assessment`);
    } else {
        fail(`${name} outside risk assessment isolation`);
    }
}

async function testWriteScope(supabase, name, role) {
    console.log('\n--- WRITE SCOPE ---');

    if (role === 'public') {
        console.log('PUBLIC user has no scoped administrative write test.');
        return;
    }

    /*
     * We deliberately attempt UPDATEs that should be rejected.
     *
     * We do not permanently modify valid demo data.
     */

    const outsideHabitation =
        TEST_IDS.outsideCityHabitation;

    const { data: habitationBefore, error: readError } =
        await supabase
            .from('habitations')
            .select('population')
            .eq('id', outsideHabitation)
            .single();

    if (readError) {
        pass(`${name} cannot read outside habitation for write test`);
    } else {
        const originalPopulation = habitationBefore.population;

        const attemptedPopulation =
            originalPopulation === 999999 ? 999998 : 999999;

        const { error: updateError } =
            await supabase
                .from('habitations')
                .update({
                    population: attemptedPopulation
                })
                .eq('id', outsideHabitation);

        const { data: after } =
            await supabase
                .from('habitations')
                .select('population')
                .eq('id', outsideHabitation)
                .single();

        if (
            !after ||
            after.population === originalPopulation
        ) {
            pass(`${name} outside habitation UPDATE blocked`);
        } else {
            fail(`${name} outside habitation UPDATE changed data`);

            // Safety cleanup if an unexpected policy failure occurred.
            await supabase
                .from('habitations')
                .update({
                    population: originalPopulation
                })
                .eq('id', outsideHabitation);
        }
    }
}

async function runUser(user) {
    console.log(`\n========================================`);
    console.log(`===== ${user.name} SCOPE TEST =====`);
    console.log(`========================================`);

    const supabase = await signIn(user);

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, role, city_id, state_id')
        .single();

    if (error) {
        throw new Error(`${user.name} profile lookup failed: ${error.message}`);
    }

    console.log(`AUTH UID: ${profile.id}`);
    console.log(`ROLE: ${profile.role}`);
    console.log(`CITY: ${profile.city_id ?? 'null'}`);
    console.log(`STATE: ${profile.state_id ?? 'null'}`);

    await testHabitationScope(
        supabase,
        user.name,
        profile.role
    );

    await testHazardScope(
        supabase,
        user.name,
        profile.role
    );

    await testRiskScope(
        supabase,
        user.name,
        profile.role
    );

    await testWriteScope(
        supabase,
        user.name,
        profile.role
    );

    await supabase.auth.signOut();
}

for (const user of users) {
    await runUser(user);
}

console.log('\n========================================');
console.log('===== SCOPE RLS TEST COMPLETE =====');
console.log('========================================');
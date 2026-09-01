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
        password: process.env.AROVIA_PUBLIC_PASSWORD,
    },
    {
        name: 'CITY',
        email: 'arovia.city.demo@gmail.com',
        password: process.env.AROVIA_CITY_PASSWORD,
    },
    {
        name: 'STATE',
        email: 'arovia.state.demo@gmail.com',
        password: process.env.AROVIA_STATE_PASSWORD,
    },
];

const IDS = {
    ownHabitation: '10000000-0000-4000-8000-000000000001',
    outsideHabitation: 'a1000000-0000-0000-0000-000000000006',

    ownHazard: '20000000-0000-4000-8000-000000000001',
    outsideHazard: 'b1000000-0000-0000-0000-000000000006',

    ownRisk: '30000000-0000-4000-8000-000000000001',
    outsideRisk: 'c1000000-0000-0000-0000-000000000006',
};

function pass(label) {
    console.log(`${label}: PASS`);
}

function blocked(label) {
    console.log(`${label}: BLOCKED`);
}

function fail(label, detail = '') {
    console.log(`${label}: FAIL${detail ? ` — ${detail}` : ''}`);
}

async function signIn(user) {
    const supabase = createClient(url, anonKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });

    const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: user.password,
    });

    if (error) {
        throw new Error(`${user.name} sign-in failed: ${error.message}`);
    }

    return supabase;
}

async function testHazardReadIsolation(supabase, name, role) {
    console.log('\n--- HAZARD CHILD-TABLE ISOLATION ---');

    const { data, error } = await supabase
        .from('hazards')
        .select('id, habitation_id, type, severity')
        .in('id', [IDS.ownHazard, IDS.outsideHazard]);

    if (error) {
        fail(`${name} hazard query`, error.message);
        return;
    }

    const rows = data ?? [];

    if (role === 'public') {
        pass(`${name} hazard read policy returned ${rows.length} permitted rows`);
        return;
    }

    const ownVisible = rows.some(r => r.id === IDS.ownHazard);
    const outsideVisible = rows.some(r => r.id === IDS.outsideHazard);

    ownVisible
        ? pass(`${name} own hazard visible`)
        : fail(`${name} own hazard visibility`);

    !outsideVisible
        ? blocked(`${name} outside hazard`)
        : fail(`${name} outside hazard is visible`);
}

async function testRiskReadIsolation(supabase, name, role) {
    console.log('\n--- RISK-ASSESSMENT CHILD-TABLE ISOLATION ---');

    const { data, error } = await supabase
        .from('risk_assessments')
        .select('id, hazard_id')
        .in('id', [IDS.ownRisk, IDS.outsideRisk]);

    if (error) {
        fail(`${name} risk query`, error.message);
        return;
    }

    const rows = data ?? [];

    if (role === 'public') {
        pass(`${name} risk read policy returned ${rows.length} permitted rows`);
        return;
    }

    const ownVisible = rows.some(r => r.id === IDS.ownRisk);
    const outsideVisible = rows.some(r => r.id === IDS.outsideRisk);

    ownVisible
        ? pass(`${name} own risk assessment visible`)
        : fail(`${name} own risk assessment visibility`);

    !outsideVisible
        ? blocked(`${name} outside risk assessment`)
        : fail(`${name} outside risk assessment is visible`);
}

async function testUnauthorizedHazardInsert(supabase, name, role) {
    console.log('\n--- UNAUTHORIZED HAZARD INSERT ---');

    if (role === 'public') {
        console.log('PUBLIC: administrative hazard INSERT not expected.');
        return;
    }

    const testId = crypto.randomUUID();

    const { error } = await supabase
        .from('hazards')
        .insert({
            id: testId,
            habitation_id: IDS.outsideHabitation,
            type: 'arovia_rls_test',
            severity: 1,
            event_time: new Date().toISOString(),
        });

    if (error) {
        blocked(`${name} cannot insert hazard for outside habitation`);
    } else {
        fail(`${name} inserted unauthorized hazard`);

        // Emergency cleanup if policy unexpectedly allowed it.
        await supabase
            .from('hazards')
            .delete()
            .eq('id', testId);
    }
}

async function testUnauthorizedRiskInsert(supabase, name, role) {
    console.log('\n--- UNAUTHORIZED RISK-ASSESSMENT INSERT ---');

    if (role === 'public') {
        console.log('PUBLIC: administrative risk INSERT not expected.');
        return;
    }

    const testId = crypto.randomUUID();

    /*
     * The selected hazard belongs to an outside habitation.
     * The RLS policy should follow:
     *
     * risk_assessment
     *       ↓
     * hazard
     *       ↓
     * habitation
     *       ↓
     * geographic scope
     */

    const { error } = await supabase
        .from('risk_assessments')
        .insert({
            id: testId,
            hazard_id: IDS.outsideHazard,
            risk_score: 1,
        });

    if (error) {
        blocked(`${name} cannot insert risk assessment for outside hazard`);
    } else {
        fail(`${name} inserted unauthorized risk assessment`);

        // Emergency cleanup.
        await supabase
            .from('risk_assessments')
            .delete()
            .eq('id', testId);
    }
}

async function testUnauthorizedHazardUpdate(supabase, name, role) {
    console.log('\n--- UNAUTHORIZED HAZARD UPDATE ---');

    if (role === 'public') {
        console.log('PUBLIC: administrative hazard UPDATE not expected.');
        return;
    }

    /*
     * Attempt to update an OUTSIDE hazard.
     * Because the row itself should be invisible under RLS,
     * UPDATE must not affect it.
     */

    const { data: before, error: readError } = await supabase
        .from('hazards')
        .select('severity')
        .eq('id', IDS.outsideHazard)
        .maybeSingle();

    if (readError || !before) {
        blocked(`${name} cannot access outside hazard for UPDATE`);
        return;
    }

    const originalSeverity = before.severity;

    const { error } = await supabase
        .from('hazards')
        .update({ severity: originalSeverity + 1 })
        .eq('id', IDS.outsideHazard);

    const { data: after } = await supabase
        .from('hazards')
        .select('severity')
        .eq('id', IDS.outsideHazard)
        .maybeSingle();

    if (!after || after.severity === originalSeverity) {
        blocked(`${name} outside hazard UPDATE`);
    } else {
        fail(`${name} modified outside hazard`);

        await supabase
            .from('hazards')
            .update({ severity: originalSeverity })
            .eq('id', IDS.outsideHazard);
    }
}

async function testUnauthorizedRiskUpdate(supabase, name, role) {
    console.log('\n--- UNAUTHORIZED RISK-ASSESSMENT UPDATE ---');

    if (role === 'public') {
        console.log('PUBLIC: administrative risk UPDATE not expected.');
        return;
    }

    const { data: before, error: readError } = await supabase
        .from('risk_assessments')
        .select('risk_score')
        .eq('id', IDS.outsideRisk)
        .maybeSingle();

    if (readError || !before) {
        blocked(`${name} cannot access outside risk assessment for UPDATE`);
        return;
    }

    const originalScore = before.risk_score;

    const { error } = await supabase
        .from('risk_assessments')
        .update({ risk_score: originalScore + 1 })
        .eq('id', IDS.outsideRisk);

    const { data: after } = await supabase
        .from('risk_assessments')
        .select('risk_score')
        .eq('id', IDS.outsideRisk)
        .maybeSingle();

    if (!after || after.risk_score === originalScore) {
        blocked(`${name} outside risk UPDATE`);
    } else {
        fail(`${name} modified outside risk assessment`);

        await supabase
            .from('risk_assessments')
            .update({ risk_score: originalScore })
            .eq('id', IDS.outsideRisk);
    }
}

async function runUser(user) {
    console.log('\n========================================');
    console.log(`===== ${user.name} WRITE SCOPE TEST =====`);
    console.log('========================================');

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

    await testHazardReadIsolation(
        supabase,
        user.name,
        profile.role
    );

    await testRiskReadIsolation(
        supabase,
        user.name,
        profile.role
    );

    await testUnauthorizedHazardInsert(
        supabase,
        user.name,
        profile.role
    );

    await testUnauthorizedRiskInsert(
        supabase,
        user.name,
        profile.role
    );

    await testUnauthorizedHazardUpdate(
        supabase,
        user.name,
        profile.role
    );

    await testUnauthorizedRiskUpdate(
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
console.log('===== WRITE-SCOPE TEST COMPLETE =====');
console.log('========================================');
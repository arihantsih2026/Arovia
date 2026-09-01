import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Missing Supabase URL or anon key in .env.local');
}

const users = {
  PUBLIC: { email: 'arovia.public.demo@gmail.com', password: process.env.AROVIA_PUBLIC_PASSWORD },
  CITY: { email: 'arovia.city.demo@gmail.com', password: process.env.AROVIA_CITY_PASSWORD },
  STATE: { email: 'arovia.state.demo@gmail.com', password: process.env.AROVIA_STATE_PASSWORD },
};

async function getClient(userConfig) {
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.auth.signInWithPassword({
    email: userConfig.email,
    password: userConfig.password,
  });
  if (error) throw new Error(`Sign in failed for ${userConfig.email}: ${error.message}`);
  return supabase;
}

async function runTests() {
  console.log('==================================================');
  console.log('M4 STAGE 3 — ALERT BROADCASTING ENGINE VERIFICATION');
  console.log('==================================================\n');

  let allPassed = true;

  try {
    const publicClient = await getClient(users.PUBLIC);
    const cityClient = await getClient(users.CITY);
    const stateClient = await getClient(users.STATE);

    console.log('--- TEST 1: Public User blocked from INSERT ---');
    const { error: publicInsertErr } = await publicClient.from('alerts').insert({
      title: 'Test Alert',
      message: 'This should fail',
      severity: 'Low',
      audience: 'public',
      active: true,
    });
    if (publicInsertErr) {
      console.log('PASS: Public user cannot insert alert (RLS blocked).');
    } else {
      console.log('FAIL: Public user successfully inserted alert!');
      allPassed = false;
    }

    console.log('\n--- TEST 2: City User inserts PUBLIC alert ---');
    const { data: cityPublicAlert, error: cityPublicErr } = await cityClient
      .from('alerts')
      .insert({
        title: 'City Broadcast to Public',
        message: 'City alerting everyone',
        severity: 'Medium',
        audience: 'public',
        active: true,
      })
      .select('id')
      .single();
    
    if (!cityPublicErr && cityPublicAlert) {
      console.log('PASS: City user inserted public alert.');
    } else {
      console.log(`FAIL: City user could not insert public alert: ${cityPublicErr?.message}`);
      allPassed = false;
    }

    console.log('\n--- TEST 3: City User inserts STATE alert (Should Fail) ---');
    const { error: cityStateErr } = await cityClient.from('alerts').insert({
      title: 'City Broadcast to State',
      message: 'This should fail',
      severity: 'Low',
      audience: 'state',
      active: true,
    });
    if (cityStateErr) {
      console.log('PASS: City user cannot insert state alert (RLS blocked).');
    } else {
      console.log('FAIL: City user successfully inserted state alert!');
      allPassed = false;
    }

    console.log('\n--- TEST 4: State User inserts STATE alert ---');
    const { data: stateAlert, error: stateErr } = await stateClient
      .from('alerts')
      .insert({
        title: 'State Broadcast',
        message: 'State advising state teams',
        severity: 'High',
        audience: 'state',
        active: true,
      })
      .select('id')
      .single();
    
    if (!stateErr && stateAlert) {
      console.log('PASS: State user inserted state alert.');
    } else {
      console.log(`FAIL: State user could not insert state alert: ${stateErr?.message}`);
      allPassed = false;
    }

    console.log('\n--- TEST 5: State User inserts CITY alert (Should Fail) ---');
    const { error: stateCityErr } = await stateClient.from('alerts').insert({
      title: 'State Broadcast to City',
      message: 'This should fail',
      severity: 'Low',
      audience: 'city',
      active: true,
    });
    if (stateCityErr) {
      console.log('PASS: State user cannot insert city alert (RLS blocked).');
    } else {
      console.log('FAIL: State user successfully inserted city alert!');
      allPassed = false;
    }

    console.log('\n--- TEST 6: City User deactivates their PUBLIC alert ---');
    if (cityPublicAlert?.id) {
      const { error: deactivateErr } = await cityClient
        .from('alerts')
        .update({ active: false })
        .eq('id', cityPublicAlert.id);
      
      if (!deactivateErr) {
        console.log('PASS: City user successfully deactivated their alert.');
      } else {
        console.log(`FAIL: City user could not deactivate alert: ${deactivateErr.message}`);
        allPassed = false;
      }
    } else {
      console.log('SKIP: No city alert ID to update.');
    }

    // Cleanup
    if (stateAlert?.id) {
      await stateClient.from('alerts').update({ active: false }).eq('id', stateAlert.id);
    }

  } catch (err) {
    console.error('FATAL VERIFICATION ERROR:', err);
    allPassed = false;
  }

  console.log('\n==================================================');
  if (allPassed) {
    console.log('ALL M4 STAGE 3 TESTS PASSED ✅');
  } else {
    console.log('SOME M4 STAGE 3 TESTS FAILED ❌');
    process.exit(1);
  }
  console.log('==================================================');
}

runTests();

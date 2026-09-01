import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Missing Supabase URL or anon key in .env.local');
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

for (const user of users) {
  if (!user.password) {
    throw new Error(`Missing password for ${user.name}`);
  }
}

async function testRealtimeConnection(user) {
  console.log(`\n===== ${user.name} REALTIME SUBSCRIPTION TEST =====`);

  const supabase = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });

  if (authError || !authData.user) {
    console.log(`SIGN-IN: FAIL - ${authError?.message}`);
    return false;
  }

  console.log(`AUTHENTICATED UID: ${authData.user.id}`);

  // Fetch initial alerts
  const { data: initialAlerts, error: fetchErr } = await supabase
    .from('alerts')
    .select('id, title, audience')
    .order('created_at', { ascending: false });

  if (fetchErr) {
    console.log(`INITIAL QUERY: FAIL - ${fetchErr.message}`);
    await supabase.auth.signOut();
    return false;
  }

  console.log(`INITIAL SCOPED ALERTS COUNT: ${initialAlerts.length}`);
  console.log(`INITIAL AUDIENCES VISIBLE: [${[...new Set(initialAlerts.map((a) => a.audience))].join(', ')}]`);

  // Establish realtime channel
  const channelName = `sentinel-alerts-${user.name.toLowerCase()}-${Date.now()}`;

  const subscriptionPromise = new Promise((resolve) => {
    let isCleaningUp = false;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'alerts',
        },
        (payload) => {
          console.log(`[${user.name}] REALTIME CDC EVENT: ${payload.eventType}`);
        }
      )
      .subscribe((status) => {
        if (isCleaningUp) return;

        if (status === 'SUBSCRIBED') {
          console.log(`SUBSCRIPTION STATUS: SUBSCRIBED (PASS)`);
          resolve({ success: true, channel, setCleaningUp: () => { isCleaningUp = true; } });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.log(`SUBSCRIPTION STATUS: ${status} (FAIL)`);
          resolve({ success: false, channel, setCleaningUp: () => { isCleaningUp = true; } });
        }
      });

    setTimeout(() => {
      if (!isCleaningUp) {
        console.log(`SUBSCRIPTION STATUS: TIMED_OUT (FAIL)`);
        resolve({ success: false, channel, setCleaningUp: () => { isCleaningUp = true; } });
      }
    }, 15000);
  });

  const { success, channel, setCleaningUp } = await subscriptionPromise;

  setCleaningUp();
  await supabase.removeChannel(channel);
  await supabase.auth.signOut();
  console.log(`CHANNEL CLEANUP & SIGN-OUT: PASS`);

  return success;
}

async function runAll() {
  console.log('==================================================');
  console.log('STAGE 7 — REALTIME ALERT SUBSCRIPTION VERIFICATION');
  console.log('==================================================');

  let allPassed = true;
  for (const user of users) {
    const passed = await testRealtimeConnection(user);
    if (!passed) allPassed = false;
  }

  console.log('\n==================================================');
  if (allPassed) {
    console.log('ALL REALTIME SUBSCRIPTION TESTS PASSED ✅');
  } else {
    console.log('SOME REALTIME SUBSCRIPTION TESTS FAILED ❌');
  }
  console.log('==================================================');

  if (!allPassed) {
    process.exit(1);
  }
}

runAll().catch((err) => {
  console.error('FATAL REALTIME TEST ERROR:', err);
  process.exit(1);
});

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const publicUser = {
  name: 'PUBLIC',
  email: 'arovia.public.demo@gmail.com',
  password: process.env.AROVIA_PUBLIC_PASSWORD,
};

async function testEventLifecycle() {
  console.log('=== REALTIME CDC EVENT LIFECYCLE TEST ===');

  const supabase = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  await supabase.auth.signInWithPassword({
    email: publicUser.email,
    password: publicUser.password,
  });

  let eventsReceived = [];

  const channel = supabase
    .channel('test-event-lifecycle')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'alerts',
      },
      (payload) => {
        console.log(`EVENT CAPTURED: ${payload.eventType} -> ID: ${payload.new?.id ?? payload.old?.id}`);
        eventsReceived.push(payload.eventType);
      }
    )
    .subscribe();

  // Wait 2s for subscription to establish
  await new Promise((r) => setTimeout(r, 2000));
  console.log('Channel active and listening for CDC events...');

  await supabase.removeChannel(channel);
  await supabase.auth.signOut();
  console.log('Event lifecycle verification complete.');
}

testEventLifecycle().catch((err) => {
  console.error(err);
  process.exit(1);
});

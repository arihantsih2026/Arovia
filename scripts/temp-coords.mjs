import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const envPath = path.resolve(process.cwd(), ".env.local");
const env = fs.readFileSync(envPath, "utf-8");
const NEXT_PUBLIC_SUPABASE_URL = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)?.[1]?.trim();
const NEXT_PUBLIC_SUPABASE_ANON_KEY = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)?.[1]?.trim();

const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data: hab } = await supabase
    .from("habitations")
    .select("id, name, district, state, location")
    .limit(1)
    .single();

  console.log("Habitation:", JSON.stringify(hab, null, 2));

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, role")
    .eq("city_id", hab?.district)
    .single();
    
  console.log("Profile for district:", JSON.stringify(profile, null, 2));
}

check();

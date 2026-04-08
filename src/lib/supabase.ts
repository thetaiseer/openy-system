import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://wbykthocbhubycdqpoat.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_ANON_KEY) {
  throw new Error('[OPENY] SUPABASE_ANON_KEY environment variable is not set.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

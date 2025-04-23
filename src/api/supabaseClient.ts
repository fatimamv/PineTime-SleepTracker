import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CONFIG } from '../config/supabase';

console.log('🔐 Supabase client initialized with:', SUPABASE_CONFIG.url);

export const supabase = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

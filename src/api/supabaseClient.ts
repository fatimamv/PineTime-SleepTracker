import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://slvyvynsusnsgvmdbqql.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsdnl2eW5zdXNuc2d2bWRicXFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDM2NzQ1MDYsImV4cCI6MjA1OTI1MDUwNn0.O8HDUMSg7-IrKbeFs3gq835r11sY5nbLkrssmpR-MFM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

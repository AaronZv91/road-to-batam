import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// This helps us debug in the browser console
if (!supabaseUrl) console.error("URL is missing from .env!");

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
import { createClient } from '@supabase/supabase-js'
// import { supabase } from './supabase';

// 1. 你的專案網址
const supabaseUrl = 'https://hudomoexydguxehkuuko.supabase.co'

// 2. 你的 Anon Key（請直接貼上那一串 eyJ... 開頭的長字串）
// 不要用 process.env，直接用引號包起來
const supabaseKey = 'sb_publishable_RMvTCW6P2t29emuhkEy4hw_d6TrdfmI'

export const supabase = createClient(supabaseUrl, supabaseKey)
console.log("目前的 Key 是:", supabaseKey);


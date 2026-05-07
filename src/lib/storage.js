import { supabase } from './supabaseClient';

// Export functions individually so App.jsx can see them
export const getMembers = async () => {
  const { data, error } = await supabase
    .from('swimmers')
    .select('*')
    .order('total_meters', { ascending: false });
  return data || [];
};

export const addMember = async (name) => {
  const { data, error } = await supabase
    .from('swimmers')
    .insert([{ name, total_meters: 0, last_active: new Date().toISOString() }])
    .select();
  return data ? data[0] : null;
};

export const logSwim = async (memberId, meters) => {
  const { data: current } = await supabase
    .from('swimmers')
    .select('total_meters')
    .eq('id', memberId)
    .single();

  const newTotal = (current?.total_meters || 0) + meters;

  await supabase
    .from('swimmers')
    .update({ total_meters: newTotal, last_active: new Date().toISOString() })
    .eq('id', memberId);
};

// Add this to the bottom of src/lib/storage.js

export const subscribeToTeamRealtime = (onUpdate) => {
  const channel = supabase
    .channel('swimmers-updates')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'swimmers' },
      (payload) => onUpdate(payload)
    )
    .subscribe(); // This must be at the end

  return channel;
};
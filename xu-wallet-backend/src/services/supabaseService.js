import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://your-supabase-url.supabase.co';
const supabaseAnonKey = 'your-supabase-anon-key';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const queryTokenMetadata = async (contractAddress, chain) => {
    const { data, error } = await supabase
        .from('token_metadata')
        .select('*')
        .eq('contract_address', contractAddress)
        .eq('chain', chain);

    if (error) {
        throw new Error(`Error querying token metadata: ${error.message}`);
    }

    return data;
};

export const saveTokenMetadata = async (contractAddress, chain, metadata) => {
    const { data, error } = await supabase
        .from('token_metadata')
        .insert([{ contract_address: contractAddress, chain, metadata }]);

    if (error) {
        throw new Error(`Error saving token metadata: ${error.message}`);
    }

    return data;
};
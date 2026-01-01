// Helper functions to fetch admin settings from database
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl || '', supabaseServiceKey || '', {
    auth: { autoRefreshToken: false, persistSession: false }
});

/**
 * Get a setting value from admin_settings table
 * @param settingKey - The key of the setting to fetch
 * @param defaultValue - Default value if setting doesn't exist
 * @returns The setting value or default value
 */
export async function getAdminSetting(settingKey: string, defaultValue: string = ''): Promise<string> {
    try {
        const { data, error } = await supabaseAdmin
            .from('admin_settings')
            .select('setting_value')
            .eq('setting_key', settingKey)
            .single();

        if (error || !data) {
            console.log(`Setting ${settingKey} not found, using default: ${defaultValue}`);
            return defaultValue;
        }

        return data.setting_value || defaultValue;
    } catch (error) {
        console.error(`Error fetching setting ${settingKey}:`, error);
        return defaultValue;
    }
}

/**
 * Get in-gym admission fee from database (from addons or admin_settings)
 * @returns Admission fee amount (default: 1200)
 */
export async function getInGymAdmissionFee(): Promise<number> {
    try {
        // First, try to get from admin_settings
        const settingValue = await getAdminSetting('in_gym_admission_fee', '');
        if (settingValue) {
            const fee = parseFloat(settingValue);
            if (!isNaN(fee) && fee > 0) {
                return fee;
            }
        }

        // Fallback: Get from most recent in-gym addon price
        const { data: addon, error } = await supabaseAdmin
            .from('membership_addons')
            .select('price')
            .eq('addon_type', 'in_gym')
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (!error && addon && addon.price) {
            return parseFloat(addon.price.toString());
        }

        // Final fallback
        return 1200;
    } catch (error) {
        console.error('Error fetching in-gym admission fee:', error);
        return 1200;
    }
}

/**
 * Get in-gym monthly fee from database (from admin_settings)
 * @returns Monthly fee amount (default: 650)
 */
export async function getInGymMonthlyFee(): Promise<number> {
    try {
        const settingValue = await getAdminSetting('in_gym_monthly_fee', '');
        if (settingValue) {
            const fee = parseFloat(settingValue);
            if (!isNaN(fee) && fee > 0) {
                return fee;
            }
        }
        return 650;
    } catch (error) {
        console.error('Error fetching in-gym monthly fee:', error);
        return 650;
    }
}

/**
 * Get all settings as a map for efficient lookup
 */
export async function getAllAdminSettings(): Promise<Map<string, string>> {
    try {
        const { data, error } = await supabaseAdmin
            .from('admin_settings')
            .select('setting_key, setting_value');

        if (error || !data) {
            return new Map();
        }

        const settingsMap = new Map<string, string>();
        data.forEach(setting => {
            settingsMap.set(setting.setting_key, setting.setting_value || '');
        });

        return settingsMap;
    } catch (error) {
        console.error('Error fetching all admin settings:', error);
        return new Map();
    }
}


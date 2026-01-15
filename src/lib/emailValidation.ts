/**
 * Email Validation Utility
 * 
 * Validates email addresses and blocks disposable/temporary email providers
 * to prevent spam account creation while allowing all legitimate email domains.
 */

/**
 * Denylist of known disposable and temporary email providers
 * This list is maintained and can be extended as new services are discovered.
 * 
 * Note: This is a server-side validation. The list should be kept up-to-date
 * but doesn't need to be exhaustive - it blocks the most common spam sources.
 * 
 * Focus on the most popular and commonly abused services to keep the list
 * maintainable while effectively blocking spam account creation.
 */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
    // Most popular disposable email services
    'mailinator.com',
    'mailinator.net',
    'mailinator.org',
    '10minutemail.com',
    '10minutemail.co.uk',
    '10minutemail.de',
    'tempmail.com',
    'tempmail.net',
    'tempmail.org',
    'guerrillamail.com',
    'guerrillamail.net',
    'guerrillamail.org',
    'guerrillamail.biz',
    'guerrillamail.info',
    'guerrillamail.de',
    'guerrillamailblock.com',
    'pokemail.net',
    'spam4.me',
    'trashmail.com',
    'trashmail.net',
    'throwaway.email',
    'mohmal.com',
    'mohmal.in',
    'fakeinbox.com',
    'fakeinbox.net',
    'fakeinbox.org',
    'yopmail.com',
    'yopmail.net',
    'yopmail.fr',
    'sharklasers.com',
    'grr.la',
    'getnada.com',
    'mintemail.com',
    'dispostable.com',
    'dispostable.net',
    'dispostable.org',
    'temp-mail.org',
    'temp-mail.io',
    'temp-mail.ru',
    'temp-mail.com',
    'temp-mail.net',
    'emailondeck.com',
    'emailondeck.net',
    'emailondeck.org',
    'emailondeck.io',
    'emailondeck.me',
    'meltmail.com',
    'meltmail.net',
    'meltmail.org',
    'melt.li',
    // Additional common disposable services
    'throwawaymail.com',
    'throwawaymail.net',
    'throwawaymail.org',
    'maildrop.cc',
    'mailsac.com',
    'mailcatch.com',
    'mailcatch.net',
    'mailcatch.org',
    'mailcatch.io',
    'mailcatch.me',
    'mailcatch.biz',
    'mailcatch.info',
    'mailcatch.us',
    'mailcatch.uk',
    'mailcatch.de',
    'mailcatch.fr',
    'mailcatch.it',
    'mailcatch.es',
    'mailcatch.pl',
    'mailcatch.ru',
    'mailcatch.jp',
    'mailcatch.cn',
    'mailcatch.in',
    'mailcatch.com.br',
    'mailcatch.com.au',
    'mailcatch.ca',
    'mailcatch.co.za',
    'mailcatch.co.nz',
    'mailcatch.ie',
    'mailcatch.be',
    'mailcatch.ch',
    'mailcatch.at',
    'mailcatch.se',
    'mailcatch.no',
    'mailcatch.dk',
    'mailcatch.fi',
    'mailcatch.nl',
    'mailcatch.pt',
    'mailcatch.gr',
    'mailcatch.cz',
    'mailcatch.hu',
    'mailcatch.ro',
    'mailcatch.bg',
    'mailcatch.sk',
    'mailcatch.si',
    'mailcatch.hr',
    'mailcatch.rs',
    'mailcatch.ba',
    'mailcatch.me',
    'mailcatch.mk',
    'mailcatch.al',
    'mailcatch.by',
    'mailcatch.ua',
    'mailcatch.kz',
    'mailcatch.am',
    'mailcatch.az',
    'mailcatch.ge',
    'mailcatch.lv',
    'mailcatch.lt',
    'mailcatch.ee',
    'mailcatch.is',
    'mailcatch.li',
    'mailcatch.lu',
    'mailcatch.mc',
    'mailcatch.ad',
    'mailcatch.sm',
    'mailcatch.va',
    'mailcatch.mt',
    'mailcatch.cy',
    'mailcatch.je',
    'mailcatch.gg',
    'mailcatch.im',
    'mailcatch.fo',
    'mailcatch.gl',
    'mailcatch.sx',
    'mailcatch.cw',
    'mailcatch.aw',
    'mailcatch.bq',
    'mailcatch.cf',
    'mailcatch.tg',
    'mailcatch.bj',
    'mailcatch.bf',
    'mailcatch.ne',
    'mailcatch.td',
    'mailcatch.cm',
    'mailcatch.ga',
    'mailcatch.cg',
    'mailcatch.cd',
    'mailcatch.gq',
    'mailcatch.st',
    'mailcatch.gw',
    'mailcatch.gn',
    'mailcatch.ml',
    'mailcatch.sl',
    'mailcatch.lr',
    'mailcatch.ci',
    'mailcatch.gh',
]);

/**
 * Extract domain from email address
 */
function extractDomain(email: string): string | null {
    if (!email || typeof email !== 'string') {
        return null;
    }

    const trimmedEmail = email.trim().toLowerCase();
    const atIndex = trimmedEmail.indexOf('@');

    if (atIndex === -1 || atIndex === trimmedEmail.length - 1) {
        return null;
    }

    return trimmedEmail.substring(atIndex + 1);
}

/**
 * Check if an email domain is in the disposable email denylist
 * 
 * @param email - The email address to check
 * @returns true if the email domain is disposable, false otherwise
 */
export function isDisposableEmail(email: string): boolean {
    const domain = extractDomain(email);

    if (!domain) {
        // Invalid email format - treat as disposable to be safe
        return true;
    }

    return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

/**
 * Validate email format and check if it's disposable
 * 
 * @param email - The email address to validate
 * @returns Object with isValid flag and error message if invalid
 */
export interface EmailValidationResult {
    isValid: boolean;
    isDisposable?: boolean;
    error?: string;
}

export function validateEmail(email: string): EmailValidationResult {
    if (!email || typeof email !== 'string') {
        return {
            isValid: false,
            error: 'Email is required'
        };
    }

    const trimmedEmail = email.trim();

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
        return {
            isValid: false,
            error: 'Please enter a valid email address'
        };
    }

    // Check if disposable
    if (isDisposableEmail(trimmedEmail)) {
        return {
            isValid: false,
            isDisposable: true,
            error: 'Temporary or disposable email addresses are not allowed. Please use a permanent email address to ensure you receive important notifications, invoices, and account updates.'
        };
    }

    return {
        isValid: true
    };
}

/**
 * Check if an email is from a recommended provider (Gmail, Outlook, Yahoo, etc.)
 * This is used for soft UI hints, not validation
 */
export function isRecommendedEmailProvider(email: string): boolean {
    const domain = extractDomain(email);

    if (!domain) {
        return false;
    }

    const recommendedDomains = [
        'gmail.com',
        'googlemail.com',
        'outlook.com',
        'hotmail.com',
        'live.com',
        'msn.com',
        'yahoo.com',
        'yahoo.co.in',
        'yahoo.co.uk',
        'protonmail.com',
        'proton.me',
        'icloud.com',
        'me.com',
        'mac.com',
        'aol.com',
        'zoho.com',
        'rediffmail.com',
        'mail.com',
        'gmx.com',
        'yandex.com',
        'mail.ru',
    ];

    return recommendedDomains.includes(domain);
}

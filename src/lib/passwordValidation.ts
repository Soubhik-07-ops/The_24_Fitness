// Password validation utility
// Consistent password requirements across the application

export interface PasswordValidationResult {
    isValid: boolean;
    error?: string;
}

/**
 * Validates password according to requirements:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
export function validatePassword(password: string): PasswordValidationResult {
    if (!password) {
        return {
            isValid: false,
            error: 'Password is required'
        };
    }

    // Minimum 8 characters
    if (password.length < 8) {
        return {
            isValid: false,
            error: 'Password must be at least 8 characters long'
        };
    }

    // Check for uppercase letter
    if (!/[A-Z]/.test(password)) {
        return {
            isValid: false,
            error: 'Password must contain at least one uppercase letter'
        };
    }

    // Check for lowercase letter
    if (!/[a-z]/.test(password)) {
        return {
            isValid: false,
            error: 'Password must contain at least one lowercase letter'
        };
    }

    // Check for number
    if (!/[0-9]/.test(password)) {
        return {
            isValid: false,
            error: 'Password must contain at least one number'
        };
    }

    // Check for special character
    if (!/[!@#$%&*]/.test(password)) {
        return {
            isValid: false,
            error: 'Password must contain at least one special character (!@#$%&*)'
        };
    }

    return {
        isValid: true
    };
}

/**
 * Get password requirements message for UI
 */
export function getPasswordRequirements(): string {
    return 'Password must be at least 8 characters with uppercase, lowercase, number, and special character (!@#$%&*)';
}


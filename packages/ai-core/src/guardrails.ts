import { logger } from '@b2automate/logger';

/**
 * Normalize leetspeak characters to standard letters
 * e.g., "d1sc0unt" -> "discount"
 */
function normalizeLeetspeak(text: string): string {
    return text
        .replace(/0/g, 'o')
        .replace(/1/g, 'i')
        .replace(/3/g, 'e')
        .replace(/4/g, 'a')
        .replace(/5/g, 's')
        .replace(/7/g, 't')
        .replace(/@/g, 'a')
        .replace(/\$/g, 's')
        .replace(/!/g, 'i');
}

export class Guardrails {
    static validateOutput(text: string): { isValid: boolean; reason?: string } {
        // Normalize text for leetspeak bypass detection
        const normalizedText = normalizeLeetspeak(text.toLowerCase());

        // 1. Price Checker: Reject specific currency symbols or numbers looking like price
        // "No price numbers allowed in AI-generated text"
        // Regex for "$100", "100 USD", "€50", "50.00"
        const priceRegex = /([$€£¥]\s?\d+)|(\d+\s?(USD|EUR|GBP|INR))/i;

        if (priceRegex.test(text)) {
            logger.warn({ text }, 'Guardrail Violation: AI attempted to output price');
            return { isValid: false, reason: 'PRICE_DETECTED' };
        }

        // 2. Prohibited Phrases (e.g. "I can offer you a discount")
        const prohibitedPhrases = [
            'discount',
            'special offer',
            'confirmed order',
            'order confirmed',
            'free gift',
            'guaranteed'
        ];

        for (const phrase of prohibitedPhrases) {
            if (normalizedText.includes(phrase)) {
                logger.warn({ text, phrase, normalizedText }, 'Guardrail Violation: Prohibited phrase');
                return { isValid: false, reason: 'PROHIBITED_PHRASE' };
            }
        }

        return { isValid: true };
    }
}

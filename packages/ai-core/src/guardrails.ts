import { logger } from '@b2automate/logger';

export class Guardrails {
    static validateOutput(text: string): { isValid: boolean; reason?: string } {
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
            /discount/i,
            /special offer/i,
            /confirmed order/i,
            /order confirmed/i
        ];

        for (const phrase of prohibitedPhrases) {
            if (phrase.test(text)) {
                logger.warn({ text, phrase: phrase.source }, 'Guardrail Violation: Prohibited phrase');
                return { isValid: false, reason: 'PROHIBITED_PHRASE' };
            }
        }

        return { isValid: true };
    }
}

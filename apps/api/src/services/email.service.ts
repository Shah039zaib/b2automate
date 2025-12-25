/**
 * Email Service - Provider-Agnostic Email Sending
 * 
 * CRITICAL: ALL EMAIL FEATURES ARE DISABLED BY DEFAULT
 * - Emails only sent if SystemSettings.emailEnabled = true
 * - Individual features controlled by separate toggles
 * - Provider must be configured by Super Admin
 * 
 * This is a SKELETON for future implementation.
 * Currently logs all email attempts without actual sending.
 */

import { PrismaClient } from '@b2automate/database';
import { logger } from '@b2automate/logger';

export interface EmailPayload {
    to: string;
    subject: string;
    html: string;
    text?: string;
}

export type EmailType = 'VERIFICATION' | 'PASSWORD_RESET' | 'PAYMENT_SUCCESS' | 'PAYMENT_FAILED' | 'SUBSCRIPTION_WARNING';

interface EmailSettings {
    emailEnabled: boolean;
    emailVerificationRequired: boolean;
    passwordResetEnabled: boolean;
    paymentEmailsEnabled: boolean;
    emailProvider: string;
    smtpHost: string | null;
    smtpPort: number | null;
    smtpUser: string | null;
    smtpPass: string | null;
    resendApiKey: string | null;
}

export class EmailService {
    constructor(private prisma: PrismaClient) { }

    /**
     * Get email settings from SystemSettings
     * Returns safe defaults if not configured or schema not migrated
     */
    private async getSettings(): Promise<EmailSettings> {
        const settings = await this.prisma.systemSettings.findFirst() as any;

        // Use safe defaults - all OFF until schema migrated and configured
        return {
            emailEnabled: settings?.emailEnabled ?? false,
            emailVerificationRequired: settings?.emailVerificationRequired ?? false,
            passwordResetEnabled: settings?.passwordResetEnabled ?? false,
            paymentEmailsEnabled: settings?.paymentEmailsEnabled ?? false,
            emailProvider: settings?.emailProvider ?? 'none',
            smtpHost: settings?.smtpHost ?? null,
            smtpPort: settings?.smtpPort ?? null,
            smtpUser: settings?.smtpUser ?? null,
            smtpPass: settings?.smtpPass ?? null,
            resendApiKey: settings?.resendApiKey ?? null,
        };
    }

    /**
     * Check if a specific email type is enabled
     */
    async isEmailTypeEnabled(type: EmailType): Promise<boolean> {
        const settings = await this.getSettings();

        // Master switch must be ON
        if (!settings.emailEnabled) {
            return false;
        }

        // Check specific feature toggle
        switch (type) {
            case 'VERIFICATION':
                return settings.emailVerificationRequired;
            case 'PASSWORD_RESET':
                return settings.passwordResetEnabled;
            case 'PAYMENT_SUCCESS':
            case 'PAYMENT_FAILED':
            case 'SUBSCRIPTION_WARNING':
                return settings.paymentEmailsEnabled;
            default:
                return false;
        }
    }

    /**
     * Send an email (if enabled)
     * Returns { sent: false, reason: string } if disabled
     * Returns { sent: true } if successful (or would be in production)
     */
    async send(type: EmailType, payload: EmailPayload): Promise<{ sent: boolean; reason?: string }> {
        const settings = await this.getSettings();

        // Check master switch
        if (!settings.emailEnabled) {
            logger.debug({ type, to: payload.to }, 'EMAIL_BLOCKED: Email system disabled');
            return { sent: false, reason: 'EMAIL_SYSTEM_DISABLED' };
        }

        // Check feature-specific toggle
        const typeEnabled = await this.isEmailTypeEnabled(type);
        if (!typeEnabled) {
            logger.debug({ type, to: payload.to }, 'EMAIL_BLOCKED: Email type disabled');
            return { sent: false, reason: `${type}_DISABLED` };
        }

        // Check provider configuration
        if (settings.emailProvider === 'none') {
            logger.debug({ type, to: payload.to }, 'EMAIL_BLOCKED: No provider configured');
            return { sent: false, reason: 'NO_PROVIDER_CONFIGURED' };
        }

        // ============================================
        // SKELETON: Actual sending logic goes here
        // ============================================
        // TODO: Implement actual providers:
        // - SMTP via nodemailer
        // - Resend API
        // - AWS SES

        logger.info({
            type,
            to: payload.to,
            subject: payload.subject,
            provider: settings.emailProvider
        }, 'EMAIL_WOULD_SEND: Email sending is skeleton-only');

        // For now, log and return success (skeleton mode)
        return { sent: true };
    }

    // ============================================
    // Email Templates
    // ============================================

    async sendVerificationEmail(to: string, token: string): Promise<{ sent: boolean; reason?: string }> {
        const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email?token=${token}`;

        return this.send('VERIFICATION', {
            to,
            subject: 'Verify your email address',
            html: `
                <h1>Verify Your Email</h1>
                <p>Click the link below to verify your email address:</p>
                <a href="${verifyUrl}">${verifyUrl}</a>
                <p>This link expires in 24 hours.</p>
            `
        });
    }

    async sendPasswordResetEmail(to: string, token: string): Promise<{ sent: boolean; reason?: string }> {
        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`;

        return this.send('PASSWORD_RESET', {
            to,
            subject: 'Reset your password',
            html: `
                <h1>Password Reset</h1>
                <p>Click the link below to reset your password:</p>
                <a href="${resetUrl}">${resetUrl}</a>
                <p>This link expires in 1 hour.</p>
                <p>If you didn't request this, ignore this email.</p>
            `
        });
    }

    async sendPaymentSuccessEmail(to: string, planName: string, amount: number): Promise<{ sent: boolean; reason?: string }> {
        return this.send('PAYMENT_SUCCESS', {
            to,
            subject: 'Payment Confirmed',
            html: `
                <h1>Payment Successful</h1>
                <p>Your payment for <strong>${planName}</strong> has been confirmed.</p>
                <p>Amount: $${(amount / 100).toFixed(2)}</p>
            `
        });
    }
}

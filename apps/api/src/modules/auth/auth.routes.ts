import { FastifyInstance } from 'fastify';
import { AuthService } from './auth.service';
import { prisma } from '../../lib/prisma';
import { AuditLogger } from '../../services/audit-logger';
import z from 'zod';

const auditLogger = new AuditLogger(prisma);
const authService = new AuthService(prisma, auditLogger);

// Token expiry constants
const ACCESS_TOKEN_EXPIRY = '15m';  // 15 minutes
const REFRESH_TOKEN_EXPIRY = '7d';  // 7 days

export async function authRoutes(app: FastifyInstance) {

    app.post('/register', {
        schema: {
            body: z.object({
                email: z.string().email(),
                password: z.string().min(8),
                tenantName: z.string().min(2)
            })
        }
    }, async (req, reply) => {
        const { email, password, tenantName } = req.body as any;

        // Defensive logging: track registration attempts
        req.log.info({ email, tenantName }, 'Registration attempt started');

        try {
            const result = await authService.registerTenant({ email, password, tenantName });
            req.log.info({ email, tenantId: result.tenant.id }, 'Registration completed successfully');
            return reply.code(201).send(result);
        } catch (err: any) {
            // Enhanced error logging for debugging
            req.log.error({
                email,
                errorCode: err?.code,
                errorName: err?.name,
                errorMessage: err?.message
            }, 'Registration failed');

            // ============================================
            // PRISMA ERROR CLASSIFICATION (Context7 verified)
            // ============================================
            // P1xxx = Connection errors → 503 DB_UNAVAILABLE
            // P2xxx = Query/constraint errors → handled below
            // PrismaClientInitializationError = Startup failure → 503
            // PrismaClientKnownRequestError = Query failure (NOT a 503)
            // ============================================

            // TRUE connectivity/initialization errors ONLY
            const isDbConnectivityError =
                err?.name === 'PrismaClientInitializationError' ||
                err?.name === 'PrismaClientRustPanicError' ||
                err?.message?.includes?.("Can't reach") ||
                err?.message?.includes?.("Connection refused") ||
                err?.message?.includes?.("Connection timed out") ||
                err?.message?.includes?.("ECONNREFUSED") ||
                err?.message?.includes?.("ETIMEDOUT") ||
                // P1xxx codes are connection errors (P1001, P1002, P1003, P1008, P1010, P1017)
                err?.code?.startsWith?.('P1');

            if (isDbConnectivityError) {
                req.log.warn({ email }, 'Registration failed due to DB connectivity issue');
                return reply.code(503).send({
                    error: 'Service temporarily unavailable',
                    code: 'DB_UNAVAILABLE'
                });
            }

            // Email already exists (P2002 unique constraint on email field)
            if (err?.code === 'P2002') {
                return reply.code(409).send({
                    error: 'Email already registered',
                    code: 'EMAIL_EXISTS'
                });
            }

            // Foreign key constraint failure (P2003)
            if (err?.code === 'P2003') {
                return reply.code(400).send({
                    error: 'Invalid reference data',
                    code: 'INVALID_REFERENCE'
                });
            }

            // Generic registration failure for other errors
            return reply.code(400).send({ error: 'Registration failed' });
        }
    });

    app.post('/login', {
        schema: {
            body: z.object({
                email: z.string().email(),
                password: z.string()
            })
        }
    }, async (req, reply) => {
        const { email, password } = req.body as any;
        try {
            const user = await authService.login({ email, password });

            // Generate access token (short-lived)
            const accessToken = app.jwt.sign(user, { expiresIn: ACCESS_TOKEN_EXPIRY });

            // Generate refresh token (long-lived, minimal payload)
            const refreshToken = app.jwt.sign(
                { id: user.id, tenantId: user.tenantId, type: 'refresh' },
                { expiresIn: REFRESH_TOKEN_EXPIRY }
            );

            // Audit Log Login Success
            await auditLogger.log({
                tenantId: user.tenantId,
                actorUserId: user.id,
                eventType: 'LOGIN_SUCCESS',
                ipAddress: req.ip
            });

            return {
                token: accessToken,          // Backward compatible
                accessToken,
                refreshToken,
                expiresIn: 900               // 15 minutes in seconds
            };
        } catch (err) {
            // Audit Log Login Failure (if we could identify tenant)
            return reply.code(401).send({ error: 'Invalid credentials' });
        }
    });

    // Refresh Token Endpoint
    app.post('/refresh', {
        schema: {
            body: z.object({
                refreshToken: z.string()
            })
        }
    }, async (req, reply) => {
        const { refreshToken } = req.body as any;

        try {
            // Verify refresh token
            const decoded = app.jwt.verify(refreshToken) as {
                id: string;
                tenantId: string;
                type?: string;
            };

            // Ensure it's a refresh token
            if (decoded.type !== 'refresh') {
                return reply.code(401).send({ error: 'Invalid token type' });
            }

            // Fetch fresh user data
            const user = await prisma.user.findUnique({
                where: { id: decoded.id },
                include: { tenant: true }
            });

            if (!user || user.tenant.status !== 'ACTIVE') {
                return reply.code(401).send({ error: 'User or tenant not active' });
            }

            // Generate new access token
            const newAccessToken = app.jwt.sign({
                id: user.id,
                email: user.email,
                role: user.role,
                tenantId: user.tenantId
            }, { expiresIn: ACCESS_TOKEN_EXPIRY });

            // Audit Log Token Refresh
            await auditLogger.log({
                tenantId: user.tenantId,
                actorUserId: user.id,
                eventType: 'TOKEN_REFRESHED',
                ipAddress: req.ip
            });

            return {
                accessToken: newAccessToken,
                token: newAccessToken,       // Backward compatible
                expiresIn: 900
            };
        } catch (err) {
            req.log.error(err);
            return reply.code(401).send({ error: 'Invalid or expired refresh token' });
        }
    });

    // Logout Endpoint
    app.post('/logout', async (req, reply) => {
        try {
            await app.authenticate(req, reply);
            const user = req.user as any;

            // SECURITY: Blacklist the token to prevent reuse
            const authHeader = req.headers.authorization;
            if (authHeader?.startsWith('Bearer ')) {
                const token = authHeader.slice(7);
                // TTL = 900 seconds (15 min) matches access token expiry
                await authService.blacklistToken(token, 900);
            }

            // Audit Log Logout
            await auditLogger.log({
                tenantId: user.tenantId,
                actorUserId: user.id,
                eventType: 'LOGOUT',
                ipAddress: req.ip
            });

            return { message: 'Logged out successfully' };
        } catch {
            // Even if auth fails, respond success (client clearing tokens)
            return { message: 'Logged out' };
        }
    });

    // ============================================
    // Password Reset (DISABLED BY DEFAULT)
    // ============================================

    /**
     * POST /auth/forgot-password
     * Request password reset - only works if passwordResetEnabled = true
     */
    app.post('/forgot-password', {
        schema: {
            body: z.object({
                email: z.string().email()
            })
        }
    }, async (req, reply) => {
        const { email } = req.body as { email: string };

        // ALWAYS return success to prevent email enumeration
        const successResponse = { message: 'If an account exists with that email, a reset link will be sent.' };

        try {
            // Import email service dynamically (cast to any for pre-migration compatibility)
            const mod = await import('../../services/email.service' as any);
            const emailService = new mod.EmailService(prisma);

            // Check if password reset is enabled
            const isEnabled = await emailService.isEmailTypeEnabled('PASSWORD_RESET');
            if (!isEnabled) {
                req.log.info({ email }, 'Password reset requested but feature is disabled');
                return successResponse;
            }

            // Find user
            const user = await prisma.user.findUnique({ where: { email } });
            if (!user) {
                return successResponse; // Don't reveal if email exists
            }

            // Generate reset token (random 32 bytes hex)
            const crypto = await import('crypto');
            const resetToken = crypto.randomBytes(32).toString('hex');
            const resetExpiry = new Date(Date.now() + 3600000); // 1 hour

            // Persist token to user record
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    passwordResetToken: resetToken,
                    passwordResetExpiry: resetExpiry
                }
            });

            req.log.info({ userId: user.id }, 'Password reset token generated');

            // Send email (will be delivered if emailEnabled + provider configured)
            await emailService.sendPasswordResetEmail(email, resetToken);

            return successResponse;
        } catch (err) {
            req.log.error({ err }, 'Password reset error');
            return successResponse; // Always success for security
        }
    });

    /**
     * POST /auth/reset-password
     * Complete password reset with token
     * - Validates token exists and not expired
     * - Hashes new password with bcrypt
     * - Clears token after use (single-use)
     */
    app.post('/reset-password', {
        schema: {
            body: z.object({
                token: z.string().min(32),
                password: z.string().min(8)
            })
        }
    }, async (req, reply) => {
        const { token, password } = req.body as { token: string; password: string };

        try {
            // Check if password reset is enabled
            const mod = await import('../../services/email.service' as any);
            const emailService = new mod.EmailService(prisma);
            const isEnabled = await emailService.isEmailTypeEnabled('PASSWORD_RESET');

            if (!isEnabled) {
                return reply.code(501).send({
                    error: 'Password reset is disabled. Contact administrator.'
                });
            }

            // Find user with this reset token
            const user = await prisma.user.findFirst({
                where: { passwordResetToken: token }
            });

            if (!user) {
                return reply.code(400).send({ error: 'Invalid or expired reset token' });
            }

            // Check token expiry
            if (!user.passwordResetExpiry || user.passwordResetExpiry < new Date()) {
                // Clear expired token
                await prisma.user.update({
                    where: { id: user.id },
                    data: { passwordResetToken: null, passwordResetExpiry: null }
                });
                return reply.code(400).send({ error: 'Reset token has expired. Please request a new one.' });
            }

            // Hash new password
            const bcrypt = await import('bcrypt');
            const passwordHash = await bcrypt.hash(password, 10);

            // Update password and clear reset token (single-use)
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    passwordHash,
                    passwordResetToken: null,
                    passwordResetExpiry: null
                }
            });

            // Audit log
            await auditLogger.log({
                tenantId: user.tenantId,
                actorUserId: user.id,
                eventType: 'PASSWORD_RESET_COMPLETED',
                ipAddress: req.ip
            });

            req.log.info({ userId: user.id }, 'Password reset completed successfully');

            return { message: 'Password has been reset successfully. You can now login.' };

        } catch (err) {
            req.log.error({ err }, 'Password reset error');
            return reply.code(500).send({ error: 'Password reset failed. Please try again.' });
        }
    });

    // ============================================
    // Email Verification (DISABLED BY DEFAULT)
    // ============================================

    /**
     * POST /auth/verify-email
     * Verify email with token - only works if emailVerificationRequired = true
     */
    app.post('/verify-email', {
        schema: {
            body: z.object({
                token: z.string().min(32)
            })
        }
    }, async (req, reply) => {
        const { token } = req.body as { token: string };

        try {
            // Check if email verification is enabled
            const mod = await import('../../services/email.service' as any);
            const emailService = new mod.EmailService(prisma);
            const isEnabled = await emailService.isEmailTypeEnabled('VERIFICATION');

            if (!isEnabled) {
                return reply.code(501).send({
                    error: 'Email verification is not enabled. Contact administrator.'
                });
            }

            // Find user with this verification token
            const user = await prisma.user.findFirst({
                where: { emailVerificationToken: token }
            });

            if (!user) {
                return reply.code(400).send({ error: 'Invalid or expired verification token' });
            }

            // Check token expiry
            if (!user.emailVerificationExpiry || user.emailVerificationExpiry < new Date()) {
                // Clear expired token
                await prisma.user.update({
                    where: { id: user.id },
                    data: { emailVerificationToken: null, emailVerificationExpiry: null }
                });
                return reply.code(400).send({ error: 'Verification token has expired. Please request a new one.' });
            }

            // Mark email as verified and clear token (single-use)
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    emailVerified: true,
                    emailVerificationToken: null,
                    emailVerificationExpiry: null
                }
            });

            // Audit log
            await auditLogger.log({
                tenantId: user.tenantId,
                actorUserId: user.id,
                eventType: 'EMAIL_VERIFIED',
                ipAddress: req.ip
            });

            req.log.info({ userId: user.id }, 'Email verified successfully');

            return { message: 'Email verified successfully.' };

        } catch (err) {
            req.log.error({ err }, 'Email verification error');
            return reply.code(500).send({ error: 'Verification failed. Please try again.' });
        }
    });

    /**
     * POST /auth/resend-verification
     * Resend verification email - only works if emailVerificationRequired = true
     */
    app.post('/resend-verification', {
        schema: {
            body: z.object({
                email: z.string().email()
            })
        }
    }, async (req, reply) => {
        const { email } = req.body as { email: string };

        // ALWAYS return success to prevent email enumeration
        const successResponse = { message: 'If an account exists with that email, a verification link will be sent.' };

        try {
            // Check if email verification is enabled
            const mod = await import('../../services/email.service' as any);
            const emailService = new mod.EmailService(prisma);
            const isEnabled = await emailService.isEmailTypeEnabled('VERIFICATION');

            if (!isEnabled) {
                req.log.info({ email }, 'Resend verification requested but feature is disabled');
                return reply.code(501).send({
                    error: 'Email verification is not enabled.'
                });
            }

            // Find user
            const user = await prisma.user.findUnique({ where: { email } });
            if (!user) {
                return successResponse; // Don't reveal if email exists
            }

            // Check if already verified
            if (user.emailVerified) {
                return successResponse; // Don't reveal status
            }

            // Generate new verification token
            const crypto = await import('crypto');
            const verificationToken = crypto.randomBytes(32).toString('hex');
            const verificationExpiry = new Date(Date.now() + 24 * 3600000); // 24 hours

            // Save token to user
            await prisma.user.update({
                where: { id: user.id },
                data: {
                    emailVerificationToken: verificationToken,
                    emailVerificationExpiry: verificationExpiry
                }
            });

            req.log.info({ userId: user.id }, 'Verification email token regenerated');

            // Send email
            await emailService.sendVerificationEmail(email, verificationToken);

            return successResponse;

        } catch (err) {
            req.log.error({ err }, 'Resend verification error');
            return successResponse; // Always success for security
        }
    });
}

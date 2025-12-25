/**
 * Media Handler for WhatsApp Worker
 * 
 * Downloads incoming media from WhatsApp messages and stores via MediaStorageService.
 * Safe to fail - worker continues even if media storage fails.
 * 
 * DESIGN:
 * - Non-blocking: Media processing doesn't block message processing
 * - Error-handled: Failures logged but don't crash worker
 * - Tenant-isolated: Each tenant's media stored separately
 */

import { WASocket, downloadMediaMessage } from '@whiskeysockets/baileys';
import { logger } from '@b2automate/logger';
import type { proto } from '@whiskeysockets/baileys';

export interface MediaDownloadResult {
    success: boolean;
    mediaUrl?: string;
    mimeType?: string;
    fileSize?: number;
    mediaKey?: string;
    error?: string;
}

/**
 * Check if a message contains media
 */
export function hasMedia(message: proto.IWebMessageInfo): boolean {
    const content = message.message;
    if (!content) return false;

    return !!(
        content.imageMessage ||
        content.videoMessage ||
        content.audioMessage ||
        content.documentMessage ||
        content.stickerMessage
    );
}

/**
 * Get media info from message
 */
export function getMediaInfo(message: proto.IWebMessageInfo): {
    type: string;
    mimetype?: string;
    filename?: string;
} | null {
    const content = message.message;
    if (!content) return null;

    if (content.imageMessage) {
        return { type: 'image', mimetype: content.imageMessage.mimetype || undefined };
    }
    if (content.videoMessage) {
        return { type: 'video', mimetype: content.videoMessage.mimetype || undefined };
    }
    if (content.audioMessage) {
        return { type: 'audio', mimetype: content.audioMessage.mimetype || undefined };
    }
    if (content.documentMessage) {
        return {
            type: 'document',
            mimetype: content.documentMessage.mimetype || undefined,
            filename: content.documentMessage.fileName || undefined
        };
    }
    if (content.stickerMessage) {
        return { type: 'sticker', mimetype: content.stickerMessage.mimetype || undefined };
    }

    return null;
}

/**
 * Download media from WhatsApp message
 * Returns buffer or null if download fails
 */
export async function downloadMedia(
    sock: WASocket,
    message: proto.IWebMessageInfo
): Promise<Buffer | null> {
    try {
        const buffer = await downloadMediaMessage(
            message,
            'buffer',
            {},
            {
                logger: logger as any,
                reuploadRequest: sock.updateMediaMessage
            }
        );
        return buffer as Buffer;
    } catch (err) {
        logger.error({ err, msgId: message.key?.id }, 'Failed to download media from WhatsApp');
        return null;
    }
}

/**
 * Process media from an incoming message
 * Downloads from WhatsApp and stores via MediaStorageService
 * 
 * This is safe to call - failures are logged but never thrown
 */
export async function processIncomingMedia(
    sock: WASocket,
    tenantId: string,
    messageId: string,
    message: proto.IWebMessageInfo
): Promise<MediaDownloadResult> {
    // Check if message has media
    if (!hasMedia(message)) {
        return { success: false, error: 'NO_MEDIA' };
    }

    const mediaInfo = getMediaInfo(message);
    if (!mediaInfo) {
        return { success: false, error: 'UNKNOWN_MEDIA_TYPE' };
    }

    logger.info({ tenantId, messageId, mediaType: mediaInfo.type }, 'Processing incoming media');

    try {
        // Step 1: Download media from WhatsApp
        const buffer = await downloadMedia(sock, message);
        if (!buffer) {
            return { success: false, error: 'DOWNLOAD_FAILED' };
        }

        logger.debug({ tenantId, messageId, size: buffer.length }, 'Media downloaded from WhatsApp');

        // Step 2: Upload to storage via MediaStorageService
        // Dynamic import to avoid circular dependencies
        const filename = mediaInfo.filename || `${mediaInfo.type}_${Date.now()}`;

        // For now, we use the skeleton MediaStorageService
        // This will return placeholder data until a real storage provider is configured
        try {
            // Try to import and use MediaStorageService if it exists in the API package
            // Since worker is separate, we create a simple storage call
            const result = await uploadToStorage(tenantId, messageId, buffer, {
                mimetype: mediaInfo.mimetype || 'application/octet-stream',
                filename
            });

            return {
                success: true,
                mediaUrl: result.mediaUrl,
                mimeType: result.mimeType,
                fileSize: result.fileSize,
                mediaKey: result.mediaKey
            };

        } catch (uploadErr) {
            logger.warn({ tenantId, messageId, err: uploadErr }, 'Media upload failed - storage not configured');
            // Return partial success - we downloaded but couldn't store
            return {
                success: false,
                error: 'STORAGE_NOT_CONFIGURED',
                mimeType: mediaInfo.mimetype,
                fileSize: buffer.length
            };
        }

    } catch (err) {
        logger.error({ err, tenantId, messageId }, 'Media processing failed');
        return { success: false, error: 'PROCESSING_FAILED' };
    }
}

/**
 * Upload buffer to storage
 * This is a placeholder that logs the intent until real storage is configured
 */
async function uploadToStorage(
    tenantId: string,
    messageId: string,
    buffer: Buffer,
    options: { mimetype: string; filename: string }
): Promise<{
    mediaUrl: string;
    mimeType: string;
    fileSize: number;
    mediaKey: string;
}> {
    // Generate media key for tenant isolation
    const date = new Date();
    const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const mediaKey = `${tenantId}/${yearMonth}/${messageId}/${options.filename}`;

    logger.info({
        tenantId,
        messageId,
        mediaKey,
        mimetype: options.mimetype,
        size: buffer.length
    }, 'MEDIA_UPLOAD_SKELETON: Would upload to storage provider');

    // Return skeleton data
    // When real storage is configured (S3, GCS, etc.), this will return actual URLs
    return {
        mediaUrl: `https://storage.placeholder.local/${mediaKey}`,
        mimeType: options.mimetype,
        fileSize: buffer.length,
        mediaKey
    };
}

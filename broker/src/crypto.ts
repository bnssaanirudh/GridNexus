import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

export function decryptValue(encryptedText: string): number {
    try {
        const secret = process.env.ENCRYPTION_KEY;
        if (!secret) throw new Error("ENCRYPTION_KEY not set in environment.");
        
        // Ensure key is 32 bytes
        const key = crypto.createHash('sha256').update(String(secret)).digest();
        
        // Split IV, encrypted data, and auth tag
        const parts = encryptedText.split(':');
        if (parts.length !== 3) throw new Error("Invalid encrypted text format.");
        
        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = Buffer.from(parts[1], 'hex');
        const authTag = Buffer.from(parts[2], 'hex');
        
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        
        return parseFloat(decrypted.toString('utf8'));
    } catch (e) {
        console.warn(`[Crypto] Failed to decrypt value. Falling back to default float parsing:`, e);
        return parseFloat(encryptedText) || 0;
    }
}

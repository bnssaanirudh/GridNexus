import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";

interface EncryptionContext {
  recordId?: string;
  field?: string;
  schemaVersion?: string;
}

/**
 * Get the encryption key from environment variable.
 * Supports ENCRYPTION_KEY (default, v1) or ENCRYPTION_KEYS as a JSON map of version to key.
 */
const getKey = (version: string = "v1"): Buffer => {
  let keyHex = "";
  if (process.env.ENCRYPTION_KEYS) {
    try {
      const keys = JSON.parse(process.env.ENCRYPTION_KEYS);
      keyHex = keys[version];
    } catch (e) {
      // fallback
    }
  }
  
  if (!keyHex && version === "v1") {
    keyHex = process.env.ENCRYPTION_KEY || "";
  }

  if (!keyHex) {
    throw new Error(`Encryption key version ${version} is missing.`);
  }
  
  const buffer = Buffer.from(keyHex, "hex");
  if (buffer.length !== 32) {
    throw new Error(`Encryption key for ${version} must be a 32-byte hex string (64 characters).`);
  }
  return buffer;
};

const _buildAAD = (context?: EncryptionContext): Buffer => {
  if (!context) return Buffer.alloc(0);
  const aadString = `${context.recordId || ""}|${context.field || ""}|${context.schemaVersion || ""}`;
  return Buffer.from(aadString, "utf8");
};

/**
 * Encrypt a plaintext string using AES-256-GCM with AAD binding.
 * @param text The plaintext string to encrypt
 * @param context Context for AAD binding
 * @returns The encrypted string formatted as version:iv:authTag:ciphertext
 */
export const encrypt = (text: string, context?: EncryptionContext): string => {
  const version = "v1"; // Current active key version
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(version), iv);
  
  const aad = _buildAAD(context);
  if (aad.length > 0) {
    cipher.setAAD(aad);
  }
  
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${version}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
};

/**
 * Decrypt a string that was encrypted with `encrypt()`.
 * @param encryptedText The encrypted string in format version:iv:authTag:ciphertext or iv:authTag:ciphertext
 * @param context Context for AAD binding
 * @returns The decrypted plaintext string
 */
export const decrypt = (encryptedText: string, context?: EncryptionContext): string => {
  const parts = encryptedText.split(":");
  let version = "v1";
  let ivHex, authTagHex, contentHex;
  
  if (parts.length === 4) {
    [version, ivHex, authTagHex, contentHex] = parts;
  } else if (parts.length === 3) {
    // Backward compatibility for old format
    [ivHex, authTagHex, contentHex] = parts;
  } else {
    throw new Error("Invalid encrypted text format.");
  }
  
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const encrypted = Buffer.from(contentHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(version), iv);
  decipher.setAuthTag(authTag);
  
  // AAD is only used if we are on the v1 format and context is provided
  // In the legacy format (parts.length === 3), AAD wasn't used.
  if (parts.length === 4) {
    const aad = _buildAAD(context);
    if (aad.length > 0) {
      decipher.setAAD(aad);
    }
  }

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
};

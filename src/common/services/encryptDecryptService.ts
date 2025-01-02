import crypto from 'crypto';
const algorithm = 'aes-256-cbc';

export class EncryptDecryptService {

    static generateIV(): Buffer {
        return crypto.randomBytes(16); // 128-bit IV (16 bytes)
    }

    public static encrypt(data: string, key: string): string {
        const iv = EncryptDecryptService.generateIV();
        const cipher = crypto.createCipheriv(algorithm, Buffer.from(key, 'hex'), iv);

        let encryptedData = cipher.update(data, 'utf-8', 'hex');
        encryptedData += cipher.final('hex');

        // Combine the IV and encrypted data into a single string
        return iv.toString('hex') + encryptedData;
    }

    public static decrypt(data: string, key: string): string {

        const iv = Buffer.from(data.slice(0, 32), 'hex'); // Extract the IV from the input data
        const encryptedData = data.slice(32);

        const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key, 'hex'), iv);

        let decryptedData = decipher.update(encryptedData, 'hex', 'utf-8');
        decryptedData += decipher.final('utf-8');

        return decryptedData;

    }

    public static generateEncryptionKey(): string {
        return crypto.randomBytes(32).toString('hex'); // 256-bit key (32 bytes)
    }

}
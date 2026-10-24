export interface CipherPort {
  encrypt(plainText: string, aad: string): Promise<string>;
  decrypt(cipherText: string, aad: string): Promise<string>;
}

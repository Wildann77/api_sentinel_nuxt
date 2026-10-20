export interface CipherPort {
  encrypt(plainText: string, aad: string): Promise<string>;
  decrypt(cipherText: string, aad: string): Promise<string>;
}

export function formatMonitorAad(monitorId: string, fieldName: string): string {
  return `monitorId:${monitorId}:field:${fieldName}`;
}

export function formatNotificationConfigAad(configId: string, fieldName: string): string {
  return `notificationConfigId:${configId}:field:${fieldName}`;
}

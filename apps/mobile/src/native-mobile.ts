import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Share } from '@capacitor/share';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';

const secureKeyPrefix = 'hello-world_';

export async function capturePhotoDataUrl(): Promise<string> {
  const photo = await Camera.getPhoto({
    quality: 85,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Camera,
  });
  if (!photo.dataUrl) {
    throw new Error('Camera did not return a data URL.');
  }
  return photo.dataUrl;
}

export async function shareTextToHelloWorld(text: string, title = 'hello-world'): Promise<void> {
  const normalized = text.trim();
  if (!normalized) {
    throw new Error('Share text cannot be empty.');
  }
  await Share.share({ title, text: normalized });
}

export async function saveSecureSecret(key: string, value: string): Promise<void> {
  const normalizedKey = normalizeSecureKey(key);
  await SecureStorage.setKeyPrefix(secureKeyPrefix);
  await SecureStorage.set(normalizedKey, value);
}

export async function getSecureSecret(key: string): Promise<string | undefined> {
  const normalizedKey = normalizeSecureKey(key);
  await SecureStorage.setKeyPrefix(secureKeyPrefix);
  const value = await SecureStorage.get(normalizedKey);
  if (value === null) {
    return undefined;
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

export async function deleteSecureSecret(key: string): Promise<boolean> {
  const normalizedKey = normalizeSecureKey(key);
  await SecureStorage.setKeyPrefix(secureKeyPrefix);
  return SecureStorage.remove(normalizedKey);
}

function normalizeSecureKey(key: string): string {
  const normalized = key.trim();
  if (!normalized) {
    throw new Error('Secure storage key cannot be empty.');
  }
  return normalized;
}

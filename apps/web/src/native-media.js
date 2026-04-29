export function canCaptureScreen(environment = globalThis) {
  return Boolean(environment.navigator?.mediaDevices?.getDisplayMedia);
}

export function canReadClipboardImage(environment = globalThis) {
  return Boolean(environment.navigator?.clipboard?.read);
}

export function canUseCapacitorCamera(environment = globalThis) {
  return Boolean(environment.Capacitor?.Plugins?.Camera?.getPhoto);
}

export async function captureScreenImage({
  environment = globalThis,
  createCanvas = (width, height) => {
    const canvas = environment.document?.createElement('canvas');
    if (!canvas) throw new Error('Canvas is not available.');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  },
} = {}) {
  const mediaDevices = environment.navigator?.mediaDevices;
  if (!mediaDevices?.getDisplayMedia) {
    throw new Error('Screen capture is not available in this runtime.');
  }
  const stream = await mediaDevices.getDisplayMedia({ video: true, audio: false });
  try {
    const video = environment.document?.createElement('video');
    if (!video) throw new Error('Video element is not available.');
    video.srcObject = stream;
    await video.play();
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const canvas = createCanvas(width, height);
    canvas.getContext('2d')?.drawImage(video, 0, 0, width, height);
    return canvas.toDataURL('image/png');
  } finally {
    stopMediaStream(stream);
  }
}

export async function readClipboardImage({ environment = globalThis } = {}) {
  const clipboard = environment.navigator?.clipboard;
  if (!clipboard?.read) {
    throw new Error('Clipboard image reading is not available in this runtime.');
  }
  const items = await clipboard.read();
  for (const item of items) {
    const imageType = item.types.find((type) => type.startsWith('image/'));
    if (!imageType) {
      continue;
    }
    const blob = await item.getType(imageType);
    return blobToDataUrl(blob, environment);
  }
  throw new Error('Clipboard does not contain an image.');
}

export async function captureMobilePhoto({ environment = globalThis } = {}) {
  const camera = environment.Capacitor?.Plugins?.Camera;
  if (!camera?.getPhoto) {
    throw new Error('Capacitor Camera is not available in this runtime.');
  }
  const photo = await camera.getPhoto({
    quality: 85,
    resultType: 'dataUrl',
    source: 'CAMERA',
  });
  if (!photo.dataUrl) {
    throw new Error('Camera did not return a data URL.');
  }
  return photo.dataUrl;
}

export function createImageAttachmentFromDataUrl(dataUrl, name, now = new Date().toISOString(), id = crypto.randomUUID()) {
  const mimeType = dataUrl.match(/^data:([^;]+);/)?.[1] ?? 'image/png';
  return {
    id,
    kind: 'image',
    name,
    mimeType,
    sizeBytes: Math.round((dataUrl.length * 3) / 4),
    dataUrl,
    createdAt: now,
  };
}

function stopMediaStream(stream) {
  for (const track of stream.getTracks?.() ?? []) {
    track.stop();
  }
}

function blobToDataUrl(blob, environment) {
  return new Promise((resolve, reject) => {
    const Reader = environment.FileReader;
    if (!Reader) {
      reject(new Error('FileReader is not available.'));
      return;
    }
    const reader = new Reader();
    reader.addEventListener('load', () => resolve(String(reader.result)));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Unable to read clipboard image.')));
    reader.readAsDataURL(blob);
  });
}

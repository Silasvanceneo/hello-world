import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canCaptureScreen,
  canReadClipboardImage,
  canUseCapacitorCamera,
  captureMobilePhoto,
  createImageAttachmentFromDataUrl,
  readClipboardImage,
} from '../apps/web/src/native-media.js';

test('native media capability predicates detect available browser and Capacitor APIs', () => {
  assert.equal(canCaptureScreen({ navigator: { mediaDevices: { getDisplayMedia() {} } } }), true);
  assert.equal(canCaptureScreen({ navigator: { mediaDevices: {} } }), false);
  assert.equal(canReadClipboardImage({ navigator: { clipboard: { read() {} } } }), true);
  assert.equal(canReadClipboardImage({ navigator: {} }), false);
  assert.equal(canUseCapacitorCamera({ Capacitor: { Plugins: { Camera: { getPhoto() {} } } } }), true);
  assert.equal(canUseCapacitorCamera({ Capacitor: { Plugins: {} } }), false);
});

test('captureMobilePhoto returns a camera data URL from Capacitor', async () => {
  const dataUrl = await captureMobilePhoto({
    environment: {
      Capacitor: {
        Plugins: {
          Camera: {
            async getPhoto(options) {
              assert.deepEqual(options, { quality: 85, resultType: 'dataUrl', source: 'CAMERA' });
              return { dataUrl: 'data:image/jpeg;base64,abc' };
            },
          },
        },
      },
    },
  });

  assert.equal(dataUrl, 'data:image/jpeg;base64,abc');
});

test('readClipboardImage reads the first clipboard image as a data URL', async () => {
  class MockFileReader {
    addEventListener(type, handler) {
      this[type] = handler;
    }

    readAsDataURL(blob) {
      this.result = `data:${blob.type};base64,abc`;
      this.load();
    }
  }

  const dataUrl = await readClipboardImage({
    environment: {
      FileReader: MockFileReader,
      navigator: {
        clipboard: {
          async read() {
            return [
              {
                types: ['text/plain', 'image/png'],
                async getType(type) {
                  return { type };
                },
              },
            ];
          },
        },
      },
    },
  });

  assert.equal(dataUrl, 'data:image/png;base64,abc');
});

test('createImageAttachmentFromDataUrl stores image metadata for chat attachments', () => {
  const attachment = createImageAttachmentFromDataUrl(
    'data:image/png;base64,abcd',
    'screenshot.png',
    '2026-04-30T00:00:00.000Z',
    'image-1',
  );

  assert.equal(attachment.id, 'image-1');
  assert.equal(attachment.kind, 'image');
  assert.equal(attachment.mimeType, 'image/png');
  assert.equal(attachment.name, 'screenshot.png');
  assert.equal(attachment.createdAt, '2026-04-30T00:00:00.000Z');
  assert.equal(attachment.dataUrl, 'data:image/png;base64,abcd');
  assert.equal(attachment.sizeBytes, 20);
});

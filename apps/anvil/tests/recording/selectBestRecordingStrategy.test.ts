import { selectBestRecordingStrategy } from '../../src/recording/selectBestRecordingStrategy';

describe('selectBestRecordingStrategy', () => {
  test('prefers the highest supported av media recorder format', () => {
    const strategy = selectBestRecordingStrategy({
      mode: 'av',
      mediaRecorderCtor: {
        isTypeSupported: (mimeType: string) => mimeType === 'video/webm;codecs=vp9,opus',
      },
    });

    expect(strategy.mechanism).toBe('media-recorder');
    expect(strategy.mimeType).toBe('video/webm;codecs=vp9,opus');
    expect(strategy.fileExtension).toBe('webm');
    expect(strategy.recordingMedium).toContain('vp9,opus');
  });

  test('uses audio media recorder when available for audio-only capture', () => {
    const strategy = selectBestRecordingStrategy({
      mode: 'audio',
      mediaRecorderCtor: {
        isTypeSupported: (mimeType: string) => mimeType === 'audio/webm;codecs=opus',
      },
    });

    expect(strategy.mechanism).toBe('media-recorder');
    expect(strategy.mimeType).toBe('audio/webm;codecs=opus');
    expect(strategy.fileExtension).toBe('webm');
  });

  test('falls back to pcm wav when audio media recorder formats are unavailable', () => {
    const strategy = selectBestRecordingStrategy({
      mode: 'audio',
      mediaRecorderCtor: {
        isTypeSupported: () => false,
      },
    });

    expect(strategy.mechanism).toBe('pcm-wav-fallback');
    expect(strategy.mimeType).toBe('audio/wav');
    expect(strategy.fileExtension).toBe('wav');
    expect(strategy.diagnostics).toContain('fallback:audio/wav');
  });
});
/** @jest-environment jsdom */

describe('ASR settings engine choice', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.resetModules();
    document.body.innerHTML = `
      <section id="asrSettingsCard" class="settings-card asr">
        <label>Engine
          <select id="asrEngine">
            <option value="webspeech">Web Speech</option>
            <option value="whisper">Whisper</option>
          </select>
        </label>
      </section>
    `;
  });

  test('marks engine selection as explicit when user changes it', async () => {
    const { wireAsrSettingsCard } = await import('../../src/ui/settings-asr');
    const { getAsrSettings } = await import('../../src/features/speech/speech-store');

    wireAsrSettingsCard(document);

    const engine = document.getElementById('asrEngine') as HTMLSelectElement | null;
    expect(engine).toBeTruthy();
    engine!.value = 'webspeech';
    engine!.dispatchEvent(new Event('change', { bubbles: true }));

    expect(localStorage.getItem('tp_asr_engine_explicit_v1')).toBe('1');
    expect(getAsrSettings().engine).toBe('webspeech');
  });
});

import { resolvePresentationScrollModeAuthority } from '../../src/script/presentation-scroll-mode-authority';

describe('presentation scroll-mode authority', () => {
  test('an exact performance request supplies ephemeral Step authority', () => {
    expect(resolvePresentationScrollModeAuthority('?presentation=performance-projection-v1')).toEqual({
      source: 'revision-bound-presentation-request',
      mode: 'step',
    });
  });

  test.each([
    '',
    '?open=script',
    '?presentation=unknown',
    '?presentation=performance-projection-v1&presentation=performance-projection-v1',
  ])('does not claim mode authority for %s', (search) => {
    expect(resolvePresentationScrollModeAuthority(search)).toBeNull();
  });
});

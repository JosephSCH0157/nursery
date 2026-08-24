import { PERFORMANCE_PRESENTATION_MODE } from './performance-presentation-boundary';

export type PresentationScrollModeAuthority = Readonly<{
  source: 'revision-bound-presentation-request';
  mode: 'step';
}>;

/**
 * A performance-projection request is fulfilled only for the canonical revision
 * loaded by the authenticated dispatch boundary. Its supported runtime mode is
 * therefore an ephemeral request authority, not a profile preference.
 */
export function resolvePresentationScrollModeAuthority(
  search: string | URLSearchParams,
): PresentationScrollModeAuthority | null {
  const params = typeof search === 'string'
    ? new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    : search;
  const values = params.getAll('presentation');
  if (values.length !== 1 || values[0] !== PERFORMANCE_PRESENTATION_MODE) return null;
  return Object.freeze({ source: 'revision-bound-presentation-request', mode: 'step' });
}

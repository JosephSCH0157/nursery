// Compatibility entry point. The connection controller owns bridge lifecycle.
import { initObsConnection } from './obs-connection';
export function initObsWiring(): void { initObsConnection(); }

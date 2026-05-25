import {
  ASR4_MOTION_RENDER_REQUEST,
  type Asr4MotionContractInput,
  type Asr4MotionRenderRequest,
} from './asr4-authority.types';

export function buildAsr4MotionRenderRequest(input: Asr4MotionContractInput): Asr4MotionRenderRequest {
  return {
    tag: ASR4_MOTION_RENDER_REQUEST,
    lane: 'motion_renderer',
    mode: 'eased_follow',
    immediateAuthorityTargetLine: input.authorityTargetLine,
    visibleTargetLine: input.authorityTargetLine,
    currentVisibleLine: Math.floor(input.currentVisibleLine),
    currentScrollTop: Number(input.currentScrollTop),
    targetScrollTop: input.targetScrollTop == null ? null : Number(input.targetScrollTop),
    requiresEasedMovement: input.authorityTargetLine != null,
    reason: input.authorityTargetLine == null ? 'no_authority_target_to_render' : 'authority_target_requires_eased_visible_follow',
  };
}

export function buildAsr4MotionDiagnostic(request: Asr4MotionRenderRequest): string {
  return `[${request.tag}] mode=${request.mode} immediateAuthorityTargetLine=${request.immediateAuthorityTargetLine ?? -1} visibleTargetLine=${request.visibleTargetLine ?? -1} currentVisibleLine=${request.currentVisibleLine} currentScrollTop=${Math.round(request.currentScrollTop)} targetScrollTop=${request.targetScrollTop == null ? -1 : Math.round(request.targetScrollTop)} requiresEasedMovement=${request.requiresEasedMovement ? 1 : 0} reason=${request.reason}`;
}


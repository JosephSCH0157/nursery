export type HearthChatScrollAffordanceMetrics = {
  topSentinelTop: number | null;
  bottomSentinelBottom: number | null;
  viewportTop: number;
  viewportBottom: number;
  logScrollTop: number;
  logScrollHeight: number;
  logClientHeight: number;
  thresholdPx?: number;
};

export type HearthChatScrollAffordanceState = {
  canScrollTop: boolean;
  canScrollBottom: boolean;
};

const DEFAULT_THRESHOLD_PX = 72;

export function resolveHearthChatScrollAffordance(
  metrics: HearthChatScrollAffordanceMetrics,
): HearthChatScrollAffordanceState {
  const thresholdPx = Math.max(0, metrics.thresholdPx ?? DEFAULT_THRESHOLD_PX);
  const canScrollPanelTop = metrics.topSentinelTop != null
    ? metrics.topSentinelTop < metrics.viewportTop - thresholdPx
    : false;
  const canScrollPanelBottom = metrics.bottomSentinelBottom != null
    ? metrics.bottomSentinelBottom > metrics.viewportBottom + thresholdPx
    : false;
  const canScrollLogTop = metrics.logScrollTop > thresholdPx;
  const logBottomDistance = metrics.logScrollHeight - metrics.logClientHeight - metrics.logScrollTop;
  const canScrollLogBottom = metrics.logScrollHeight > metrics.logClientHeight
    && logBottomDistance > thresholdPx;

  return {
    canScrollTop: canScrollPanelTop || canScrollLogTop,
    canScrollBottom: canScrollPanelBottom || canScrollLogBottom,
  };
}

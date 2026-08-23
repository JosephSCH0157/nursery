const HE8_TELEMETRY_FLAG = "hammer_he8_native_telemetry";
const HE8_TELEMETRY_VALUE = "florida-placement-f89a4ff5-v1";
const HE8_WORKSPACE_ID = "494c2ae5-9037-4208-b898-fab4898ab430";
const HE8_PLACEMENT_ID = "placement_mm_from_media_still_broll-beat-f89a4ff5-04b5-408d-9cc9-83a7ad9a65a2";
const HE8_EVIDENCE_ELEMENT_ID = "hammer-he8-native-telemetry";

type He8ShellSnapshot = {
  selectedPlacementIds: string[];
  passLabel: string | null;
  removeClipVisible: boolean;
};

type He8TelemetryEvidence = {
  schema: "forge.hammer-he8-native-telemetry.v1";
  placementId: string;
  events: Array<Record<string, unknown>>;
  shellTransitions: Array<{ reason: string; capturedAt: string; snapshot: He8ShellSnapshot }>;
};

function describeNode(node: EventTarget | null): Record<string, unknown> | string {
  if (!(node instanceof Element)) return String(node);
  return {
    tag: node.tagName.toLowerCase(),
    id: node.id || null,
    className: typeof node.className === "string" ? node.className : null,
    placementId: node.closest<HTMLElement>("[data-clip-id]")?.dataset.clipId ?? null,
  };
}

function isVisible(element: Element): boolean {
  return element instanceof HTMLElement && element.offsetParent !== null;
}

function readShellSnapshot(): He8ShellSnapshot {
  const selectedPlacementIds = Array.from(document.querySelectorAll<HTMLElement>("[data-clip-id].is-selected"))
    .map((element) => element.dataset.clipId ?? "")
    .filter(Boolean);
  const passLabel = document.querySelector(".hammer-pass-head span")?.textContent?.trim() ?? null;
  const removeClipVisible = Array.from(document.querySelectorAll("button"))
    .some((button) => button.textContent?.trim() === "Remove Clip" && isVisible(button));
  return { selectedPlacementIds, passLabel, removeClipVisible };
}

function isEnabled(search: string, location: Location): boolean {
  if (!import.meta.env.DEV) return false;
  if (location.protocol !== "http:") return false;
  if (location.hostname !== "127.0.0.1" && location.hostname !== "localhost") return false;
  const params = new URLSearchParams(search);
  return params.get(HE8_TELEMETRY_FLAG) === HE8_TELEMETRY_VALUE
    && params.get("workspace_id") === HE8_WORKSPACE_ID;
}

export function installHe8NativeTelemetry(search = window.location.search): (() => void) | null {
  if (!isEnabled(search, window.location)) return null;
  if (document.getElementById(HE8_EVIDENCE_ELEMENT_ID)) return null;

  const evidence: He8TelemetryEvidence = {
    schema: "forge.hammer-he8-native-telemetry.v1",
    placementId: HE8_PLACEMENT_ID,
    events: [],
    shellTransitions: [],
  };
  const output = document.createElement("script");
  output.id = HE8_EVIDENCE_ELEMENT_ID;
  output.type = "application/json";
  document.head.append(output);
  let lastShellSnapshot = "";
  let hasObservedAuthorizedInput = false;

  const publish = () => {
    output.textContent = JSON.stringify(evidence);
  };
  const captureShell = (reason: string) => {
    const snapshot = readShellSnapshot();
    const serialized = JSON.stringify(snapshot);
    if (serialized === lastShellSnapshot) return;
    lastShellSnapshot = serialized;
    evidence.shellTransitions.push({ reason, capturedAt: new Date().toISOString(), snapshot });
    publish();
  };
  const captureEvent = (event: Event) => {
    const placementId = event.target instanceof Element
      ? event.target.closest<HTMLElement>("[data-clip-id]")?.dataset.clipId ?? null
      : null;
    if (placementId !== HE8_PLACEMENT_ID) return;
    hasObservedAuthorizedInput = true;
    const mouseEvent = event instanceof MouseEvent ? event : null;
    evidence.events.push({
      event: event.type,
      isTrusted: event.isTrusted,
      placementId,
      clientX: mouseEvent?.clientX ?? null,
      clientY: mouseEvent?.clientY ?? null,
      screenX: mouseEvent?.screenX ?? null,
      screenY: mouseEvent?.screenY ?? null,
      button: mouseEvent?.button ?? null,
      buttons: mouseEvent?.buttons ?? null,
      timeStamp: event.timeStamp,
      capturedAt: new Date().toISOString(),
      target: describeNode(event.target),
      composedPath: event.composedPath().slice(0, 12).map(describeNode),
      shell: readShellSnapshot(),
    });
    publish();
    queueMicrotask(() => captureShell(`${event.type}:microtask`));
    requestAnimationFrame(() => captureShell(`${event.type}:animation-frame`));
  };
  const eventNames = ["pointerdown", "mousedown", "focus", "pointerup", "click"] as const;
  for (const eventName of eventNames) document.addEventListener(eventName, captureEvent, true);
  const observer = new MutationObserver(() => {
    if (hasObservedAuthorizedInput) captureShell("dom-mutation");
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ["class"], childList: true, subtree: true });
  captureShell("installed");

  return () => {
    observer.disconnect();
    for (const eventName of eventNames) document.removeEventListener(eventName, captureEvent, true);
    output.remove();
  };
}

export const HE8_NATIVE_TELEMETRY_TEST_CONTRACT = {
  evidenceElementId: HE8_EVIDENCE_ELEMENT_ID,
  flag: HE8_TELEMETRY_FLAG,
  flagValue: HE8_TELEMETRY_VALUE,
  placementId: HE8_PLACEMENT_ID,
  workspaceId: HE8_WORKSPACE_ID,
} as const;

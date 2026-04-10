import type {
  FaceLandmarkProvider,
  FaceLandmarkProviderReadiness,
  FaceLandmarksFrame,
  FacePoint2D,
  FacePoseHint,
} from "../types";

type FaceLandmarkerModule = typeof import("@mediapipe/tasks-vision");

type MediapipeLandmark = {
  x: number;
  y: number;
  z?: number;
};

type MediapipeFaceLandmarker = {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): {
    faceLandmarks: MediapipeLandmark[][];
    facialTransformationMatrixes?: Array<{ data: Float32Array | number[] }>;
  };
  close(): void;
};

function nowMs(): number {
  return (typeof performance !== "undefined" && typeof performance.now === "function") ? performance.now() : Date.now();
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function toPoint(value: MediapipeLandmark | null): FacePoint2D | null {
  if (!value) return null;
  if (!Number.isFinite(value.x) || !Number.isFinite(value.y)) return null;
  return { x: value.x, y: value.y, z: Number.isFinite(value.z) ? value.z : undefined };
}

function meanPoint(points: FacePoint2D[]): FacePoint2D | null {
  if (points.length === 0) return null;
  let sx = 0;
  let sy = 0;
  let sz = 0;
  let hasZ = false;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
    if (typeof p.z === "number") {
      sz += p.z;
      hasZ = true;
    }
  }
  return {
    x: sx / points.length,
    y: sy / points.length,
    z: hasZ ? (sz / points.length) : undefined,
  };
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

function computePoseFromMatrix(matrix: Float32Array | number[] | null | undefined): FacePoseHint {
  if (!matrix || matrix.length < 16) {
    return { yawDeg: null, pitchDeg: null, rollDeg: null };
  }

  const m = matrix;
  const r00 = Number(m[0]);
  const r01 = Number(m[1]);
  const r02 = Number(m[2]);
  const r10 = Number(m[4]);
  const r11 = Number(m[5]);
  const r12 = Number(m[6]);
  const r20 = Number(m[8]);
  const r21 = Number(m[9]);
  const r22 = Number(m[10]);

  if (![r00, r01, r02, r10, r11, r12, r20, r21, r22].every((v) => Number.isFinite(v))) {
    return { yawDeg: null, pitchDeg: null, rollDeg: null };
  }

  // Conservative, approximate extraction (Tait-Bryan angles, yaw-pitch-roll).
  const yaw = Math.atan2(r10, r00);
  const pitch = Math.atan2(-r20, Math.sqrt((r21 * r21) + (r22 * r22)));
  const roll = Math.atan2(r21, r22);

  return {
    yawDeg: radToDeg(yaw),
    pitchDeg: radToDeg(pitch),
    rollDeg: radToDeg(roll),
  };
}

function computeRollFromEyes(args: { leftOuter: FacePoint2D; rightOuter: FacePoint2D }): number {
  const dx = args.rightOuter.x - args.leftOuter.x;
  const dy = args.rightOuter.y - args.leftOuter.y;
  return radToDeg(Math.atan2(dy, dx));
}

const LEFT_EYE = {
  outerCorner: 33,
  innerCorner: 133,
  upperLid: 159,
  lowerLid: 145,
  iris: [468, 469, 470, 471, 472] as const,
};

const RIGHT_EYE = {
  outerCorner: 263,
  innerCorner: 362,
  upperLid: 386,
  lowerLid: 374,
  iris: [473, 474, 475, 476, 477] as const,
};

function getPoint(landmarks: MediapipeLandmark[], index: number): FacePoint2D | null {
  return toPoint(landmarks[index] ?? null);
}

function buildEye(args: {
  landmarks: MediapipeLandmark[];
  spec: typeof LEFT_EYE | typeof RIGHT_EYE;
  warnings: string[];
}): {
  eye: FaceLandmarksFrame["leftEye"];
  eyeWidth: number;
  ear: number | null;
  irisCenter: FacePoint2D | null;
  irisMissing: boolean;
} | null {
  const inner = getPoint(args.landmarks, args.spec.innerCorner);
  const outer = getPoint(args.landmarks, args.spec.outerCorner);
  const upper = getPoint(args.landmarks, args.spec.upperLid);
  const lower = getPoint(args.landmarks, args.spec.lowerLid);
  if (!inner || !outer || !upper || !lower) return null;

  const irisPoints = args.spec.iris.map((idx) => getPoint(args.landmarks, idx)).filter((v): v is FacePoint2D => !!v);
  const irisMissing = irisPoints.length < 3;
  if (irisMissing) args.warnings.push("iris_missing");

  const irisCenter = irisMissing ? null : meanPoint(irisPoints);
  const eyeWidth = Math.hypot(inner.x - outer.x, inner.y - outer.y);
  const eyeHeight = Math.hypot(upper.x - lower.x, upper.y - lower.y);
  const ear = eyeWidth > 0 ? (eyeHeight / eyeWidth) : null;

  return {
    eye: {
      innerCorner: inner,
      outerCorner: outer,
      upperLid: upper,
      lowerLid: lower,
      iris: irisPoints,
    },
    eyeWidth,
    ear,
    irisCenter,
    irisMissing,
  };
}

export class MediapipeFaceLandmarkerProvider implements FaceLandmarkProvider {
  public readonly name = "mediapipe_face_landmarker";
  private readiness: FaceLandmarkProviderReadiness = { status: "idle" };
  private modulePromise: Promise<FaceLandmarkerModule> | null = null;
  private engine: MediapipeFaceLandmarker | null = null;
  private readonly options: { wasmBaseUrl?: string; modelAssetPath?: string } | undefined;

  public constructor(options?: { wasmBaseUrl?: string; modelAssetPath?: string }) {
    this.options = options;
  }

  public getReadiness(): FaceLandmarkProviderReadiness {
    return this.readiness;
  }

  public isReady(): boolean {
    return this.readiness.status === "ready" && this.engine != null;
  }

  public async initialize(): Promise<void> {
    if (this.engine) return;
    if (this.readiness.status === "initializing") return;
    this.readiness = { status: "initializing", startedAtMs: nowMs() };

    try {
      if (!this.modulePromise) {
        this.modulePromise = import("@mediapipe/tasks-vision");
      }
      const module = await this.modulePromise;

      const wasmBaseUrl = this.options?.wasmBaseUrl?.trim()
        || "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm";
      const modelAssetPath = this.options?.modelAssetPath?.trim()
        || "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task";

      const filesetResolver = await module.FilesetResolver.forVisionTasks(wasmBaseUrl);
      const landmarker = await module.FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath,
        },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: true,
      });

      this.engine = landmarker as unknown as MediapipeFaceLandmarker;
      this.readiness = { status: "ready" };
    } catch (error) {
      this.engine = null;
      this.readiness = {
        status: "failed",
        error: error instanceof Error ? error.message : "Face landmarker provider initialization failed.",
      };
    }
  }

  public async dispose(): Promise<void> {
    try {
      this.engine?.close();
    } catch {
      // ignore
    }
    this.engine = null;
    this.readiness = { status: "idle" };
    this.modulePromise = null;
  }

  public async analyzeFrame(args: { video: HTMLVideoElement; timestampSec: number }): Promise<FaceLandmarksFrame | null> {
    if (!this.engine) {
      await this.initialize();
    }
    if (!this.engine) {
      throw new Error(this.readiness.status === "failed" ? this.readiness.error : "Face landmarker provider unavailable.");
    }

    const started = nowMs();
    const timestampMs = Math.max(0, Math.round(args.timestampSec * 1000));
    const result = this.engine.detectForVideo(args.video, timestampMs);
    const finished = nowMs();
    const processingMs = Math.max(0, Math.round((finished - started) * 10) / 10);

    const landmarks = Array.isArray(result.faceLandmarks) ? result.faceLandmarks[0] : null;
    if (!landmarks || landmarks.length === 0) {
      return null;
    }

    const warnings: string[] = [];
    const left = buildEye({ landmarks, spec: LEFT_EYE, warnings });
    const right = buildEye({ landmarks, spec: RIGHT_EYE, warnings });
    if (!left || !right) {
      warnings.push("missing_eye_landmarks");
      return null;
    }

    const interOcular = Math.hypot(
      ((left.eye.outerCorner.x + left.eye.innerCorner.x) / 2) - ((right.eye.outerCorner.x + right.eye.innerCorner.x) / 2),
      ((left.eye.outerCorner.y + left.eye.innerCorner.y) / 2) - ((right.eye.outerCorner.y + right.eye.innerCorner.y) / 2),
    );
    if (interOcular < 0.04) warnings.push("face_too_small");

    let confidence = 1;
    if (interOcular < 0.04) confidence *= 0.35;
    if (left.irisMissing || right.irisMissing) confidence *= 0.45;
    if ((left.ear != null && left.ear < 0.12) || (right.ear != null && right.ear < 0.12)) confidence *= 0.75;
    confidence = clamp01(confidence);

    const poseFromMatrix = computePoseFromMatrix(result.facialTransformationMatrixes?.[0]?.data);
    const pose: FacePoseHint = {
      yawDeg: poseFromMatrix.yawDeg,
      pitchDeg: poseFromMatrix.pitchDeg,
      rollDeg: poseFromMatrix.rollDeg,
    };

    if (pose.rollDeg == null) {
      pose.rollDeg = computeRollFromEyes({ leftOuter: left.eye.outerCorner, rightOuter: right.eye.outerCorner });
    }

    return {
      providerName: this.name,
      sourceTimestampSec: args.timestampSec,
      processingMs,
      confidenceScore: clamp01(confidence),
      warnings,
      pose,
      leftEye: left.eye,
      rightEye: right.eye,
    };
  }
}

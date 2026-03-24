export interface ThumbnailConcept {
  id: string;
  title?: string;
  description: string;
  hasFace?: boolean;
  emotionIntensity?: number;
  textLength?: number;
  contrastScore?: number;
  noveltyScore?: number;
  topicRelevance?: number;
}

export interface ThumbnailEvaluation {
  conceptId: string;
  ctrScore: number;
  curiosityScore: number;
  clarityScore: number;
  emotionScore: number;
  brandFitScore: number;
  recommendationReason: string;
  labels: Array<
    | "recommended_click_candidate"
    | "strong_alternate"
    | "safe_pick"
    | "high_risk_high_reward"
  >;
}

export const THUMBNAIL_CTR_WEIGHTS = {
  curiosity: 0.30,
  clarity: 0.25,
  emotion: 0.20,
  contrast: 0.15,
  novelty: 0.10,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function scoreCuriosity(concept: ThumbnailConcept): number {
  return clamp((concept.noveltyScore ?? 0.5) * 100, 0, 100);
}

export function scoreClarity(concept: ThumbnailConcept): number {
  const textPenalty = concept.textLength != null && concept.textLength > 40 ? 20 : 0;
  return clamp(((concept.contrastScore ?? 0.7) * 100) - textPenalty, 0, 100);
}

export function scoreEmotion(concept: ThumbnailConcept): number {
  if (!concept.hasFace) return 40;
  return clamp((concept.emotionIntensity ?? 0.6) * 100, 0, 100);
}

export function scoreBrandFit(concept: ThumbnailConcept): number {
  return clamp((concept.topicRelevance ?? 0.8) * 100, 0, 100);
}

export function computeCtrScore(scores: {
  curiosity: number;
  clarity: number;
  emotion: number;
  contrast: number;
  novelty: number;
}): number {
  return Math.round(
    scores.curiosity * THUMBNAIL_CTR_WEIGHTS.curiosity
      + scores.clarity * THUMBNAIL_CTR_WEIGHTS.clarity
      + scores.emotion * THUMBNAIL_CTR_WEIGHTS.emotion
      + scores.contrast * THUMBNAIL_CTR_WEIGHTS.contrast
      + scores.novelty * THUMBNAIL_CTR_WEIGHTS.novelty,
  );
}

function createRecommendationReason(evaluation: ThumbnailEvaluation): string {
  const drivers: string[] = [];
  if (evaluation.curiosityScore >= 70) drivers.push("strong curiosity");
  if (evaluation.clarityScore >= 70) drivers.push("clear visual readability");
  if (evaluation.emotionScore >= 70) drivers.push("strong emotional pull");
  if (!drivers.length) {
    drivers.push("balanced curiosity, clarity, and emotional signals");
  }
  return `Highest predicted click-through due to ${drivers.join(", ")}. Advisory only.`;
}

export function evaluateThumbnailConcepts(concepts: ThumbnailConcept[]): ThumbnailEvaluation[] {
  const evaluations = concepts.map((concept) => {
    const curiosity = scoreCuriosity(concept);
    const clarity = scoreClarity(concept);
    const emotion = scoreEmotion(concept);
    const brandFit = scoreBrandFit(concept);
    const contrast = clamp((concept.contrastScore ?? 0.7) * 100, 0, 100);
    const novelty = clamp((concept.noveltyScore ?? 0.5) * 100, 0, 100);
    const ctrScore = computeCtrScore({
      curiosity,
      clarity,
      emotion,
      contrast,
      novelty,
    });

    return {
      conceptId: concept.id,
      ctrScore,
      curiosityScore: curiosity,
      clarityScore: clarity,
      emotionScore: emotion,
      brandFitScore: brandFit,
      recommendationReason: "",
      labels: [] as ThumbnailEvaluation["labels"],
    };
  });

  const ranked = evaluations
    .map((evaluation, index) => ({
      evaluation,
      index,
    }))
    .sort((a, b) => {
      if (b.evaluation.ctrScore !== a.evaluation.ctrScore) {
        return b.evaluation.ctrScore - a.evaluation.ctrScore;
      }
      return a.index - b.index;
    });

  if (ranked.length > 0) {
    const top = ranked[0].evaluation;
    top.labels.push("recommended_click_candidate");
    top.recommendationReason = createRecommendationReason(top);
  }

  if (ranked.length > 1) {
    ranked[1].evaluation.labels.push("strong_alternate");
  }

  const topCtrScore = ranked[0]?.evaluation.ctrScore ?? 0;
  evaluations.forEach((evaluation) => {
    if (evaluation.brandFitScore > 85 && evaluation.ctrScore < topCtrScore * 0.9) {
      evaluation.labels.push("safe_pick");
    }

    if (evaluation.curiosityScore > 85 && evaluation.brandFitScore < 60) {
      evaluation.labels.push("high_risk_high_reward");
    }
  });

  return evaluations;
}
import assert from "node:assert/strict";
import {
  computeCtrScore,
  evaluateThumbnailConcepts,
  scoreClarity,
  scoreCuriosity,
  scoreEmotion,
  type ThumbnailConcept,
} from "../src/lib/thumbnail-ctr-evaluator";

function testScoreFunctions() {
  const concept: ThumbnailConcept = {
    id: "c1",
    description: "A bold reveal",
    hasFace: true,
    emotionIntensity: 0.9,
    textLength: 55,
    contrastScore: 0.8,
    noveltyScore: 0.75,
    topicRelevance: 0.85,
  };

  assert.equal(scoreCuriosity(concept), 75);
  assert.equal(scoreEmotion(concept), 90);
  assert.equal(scoreClarity(concept), 60);
}

function testCtrComposition() {
  const score = computeCtrScore({
    curiosity: 80,
    clarity: 70,
    emotion: 90,
    contrast: 70,
    novelty: 80,
  });
  assert.equal(score, 78);
}

function testDeterministicRecommendationAndLabels() {
  const concepts: ThumbnailConcept[] = [
    {
      id: "alpha",
      description: "Known format, clear but predictable",
      hasFace: false,
      textLength: 20,
      contrastScore: 0.85,
      noveltyScore: 0.3,
      topicRelevance: 0.95,
    },
    {
      id: "beta",
      description: "Strong emotional face and mystery setup",
      hasFace: true,
      emotionIntensity: 0.9,
      textLength: 18,
      contrastScore: 0.82,
      noveltyScore: 0.92,
      topicRelevance: 0.88,
    },
    {
      id: "gamma",
      description: "Very novel but loosely connected",
      hasFace: true,
      emotionIntensity: 0.8,
      textLength: 22,
      contrastScore: 0.78,
      noveltyScore: 0.95,
      topicRelevance: 0.45,
    },
  ];

  const firstRun = evaluateThumbnailConcepts(concepts);
  const secondRun = evaluateThumbnailConcepts(concepts);

  assert.deepEqual(firstRun, secondRun);

  const recommended = firstRun.find((entry) => entry.labels.includes("recommended_click_candidate"));
  assert.equal(recommended?.conceptId, "beta");
  assert.equal(Boolean(recommended?.recommendationReason.length), true);

  const alternate = firstRun.find((entry) => entry.labels.includes("strong_alternate"));
  assert.equal(alternate?.conceptId, "gamma");

  const safePick = firstRun.find((entry) => entry.labels.includes("safe_pick"));
  assert.equal(safePick?.conceptId, "alpha");

  const risky = firstRun.find((entry) => entry.labels.includes("high_risk_high_reward"));
  assert.equal(risky?.conceptId, "gamma");
}

function run() {
  testScoreFunctions();
  testCtrComposition();
  testDeterministicRecommendationAndLabels();
  // eslint-disable-next-line no-console
  console.log("Thumbnail CTR evaluator tests passed.");
}

run();
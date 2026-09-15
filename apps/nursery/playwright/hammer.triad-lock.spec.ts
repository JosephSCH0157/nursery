import { expect, test, type Locator, type Page } from "playwright/test";

const WORKSPACE_ID = process.env.FORGE_TEST_HAMMER_WORKSPACE_ID ?? process.env.FORGE_TEST_WORKSPACE_ID ?? "";
const WORKPIECE_ID = process.env.FORGE_TEST_HAMMER_WORKPIECE_ID ?? "";

async function openHammerEditor(page: Page): Promise<void> {
  await page.goto(
    `/app/hammer/editor?workspace_id=${encodeURIComponent(WORKSPACE_ID)}&workpiece_id=${encodeURIComponent(WORKPIECE_ID)}`,
  );
  // Cold canonical preparation measured >15s; wait for the actual prepared editor.
  await expect(page.locator("section.hammer-source-bay")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("section.hammer-preview-bay")).toBeVisible();
  await expect(page.locator("section.hammer-timeline-dock")).toBeVisible();
  const expandTimeline = page.locator("section.hammer-timeline-dock").getByRole("button", { name: "Expand", exact: true });
  if (await expandTimeline.isVisible()) {
    await expandTimeline.click();
    await expect(page.locator("section.hammer-timeline-dock").getByRole("button", { name: "Collapse", exact: true })).toBeVisible();
  }
}

function transcriptLines(page: Page): Locator {
  return page.locator(".hammer-transcript-doc-seg");
}

function activeTranscriptLine(page: Page): Locator {
  return page.locator(".hammer-transcript-doc-seg.is-active");
}

function dialogueTimelineBlocks(page: Page): Locator {
  return page.locator(".hammer-timeline-block--dialogue");
}

function activeDialogueTimelineBlock(page: Page): Locator {
  return page.locator(".hammer-timeline-block--dialogue.is-active");
}

async function requireEditableTranscript(page: Page, minimumLines = 6): Promise<void> {
  const transcriptTab = page.locator("section.hammer-source-bay").getByRole("button", { name: "Transcript", exact: true });
  await expect(transcriptTab).toBeVisible();
  await transcriptTab.click();
  await expect(transcriptLines(page).first()).toBeVisible();
  const lineCount = await transcriptLines(page).count();
  test.skip(lineCount < minimumLines, `Need at least ${minimumLines} transcript lines for triad lock smoke.`);
}

test.describe("hammer_triad_lock_smoke", () => {
  test.beforeAll(() => {
    if (!WORKSPACE_ID || !WORKPIECE_ID) throw new Error("Authenticated Hammer fixture authority is missing. Run pnpm --filter nursery browser:prepare.");
  });

  test("transcript click centers the right world", async ({ page }) => {
    await openHammerEditor(page);
    await requireEditableTranscript(page);

    const targetLine = transcriptLines(page).nth(2);
    const targetSpeaker = (await targetLine.locator("xpath=ancestor::section[contains(@class, 'hammer-transcript-doc-turn')]").locator(".hammer-transcript-doc-turn__label").textContent())?.trim() ?? "";
    const targetText = ((await targetLine.textContent()) ?? "").trim();
    await targetLine.click();

    await expect(activeTranscriptLine(page)).toHaveCount(1);
    await expect(activeDialogueTimelineBlock(page)).toHaveCount(1);
    await expect(activeTranscriptLine(page)).toHaveText(targetText);

    const centeredRatio = await page.evaluate(() => {
      const scroll = document.querySelector(".hammer-timeline-track-scroll");
      const block = document.querySelector(".hammer-timeline-block--dialogue.is-active");
      if (!scroll || !block) return null;
      const scrollRect = scroll.getBoundingClientRect();
      const blockRect = block.getBoundingClientRect();
      const blockCenter = blockRect.left + (blockRect.width / 2);
      const scrollCenter = scrollRect.left + (scrollRect.width / 2);
      return Math.abs(blockCenter - scrollCenter) / scrollRect.width;
    });
    expect(centeredRatio).not.toBeNull();
    expect(centeredRatio ?? 1).toBeLessThan(0.38);

    await expect(page.locator(".hammer-preview-surface__label")).toContainText(targetSpeaker.replace(/:$/, ""));
  });

  test("playhead progression updates transcript without scroll thrash", async ({ page }) => {
    await openHammerEditor(page);
    await requireEditableTranscript(page);

    await page.evaluate(() => {
      const w = window as Window & { __scrollIntoViewCount?: number; __origScrollIntoView?: Element["scrollIntoView"] };
      if (!w.__origScrollIntoView) {
        w.__scrollIntoViewCount = 0;
        w.__origScrollIntoView = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function patchedScrollIntoView(...args: Parameters<Element["scrollIntoView"]>) {
          w.__scrollIntoViewCount = (w.__scrollIntoViewCount ?? 0) + 1;
          return w.__origScrollIntoView!.apply(this, args);
        };
      } else {
        w.__scrollIntoViewCount = 0;
      }
    });

    const playhead = page.getByLabel("Track-based timeline").getByLabel("Timeline playhead", { exact: true });
    await expect(playhead).toBeVisible();
    const playheadBox = await playhead.boundingBox();
    expect(playheadBox).not.toBeNull();

    const seenActive = new Set<string>();
    const steps = [0.16, 0.27, 0.38, 0.49];
    let previousActiveText = ((await activeTranscriptLine(page).textContent()) ?? "").trim();
    for (const ratio of steps) {
      await playhead.click({ position: { x: Math.max(1, (playheadBox?.width ?? 1) * ratio), y: Math.max(1, (playheadBox?.height ?? 1) / 2) } });
      await expect.poll(async () => ((await activeTranscriptLine(page).textContent()) ?? "").trim()).not.toBe(previousActiveText);
      const activeText = ((await activeTranscriptLine(page).textContent()) ?? "").trim();
      if (activeText) seenActive.add(activeText);
      previousActiveText = activeText;
    }

    expect(seenActive.size).toBeGreaterThanOrEqual(2);
    const scrollIntoViewCount = await page.evaluate(() => {
      const w = window as Window & { __scrollIntoViewCount?: number };
      return w.__scrollIntoViewCount ?? 0;
    });
    expect(scrollIntoViewCount).toBeLessThanOrEqual(steps.length + 4);
  });

  test("timeline selection back-propagates cleanly", async ({ page }) => {
    await openHammerEditor(page);
    await requireEditableTranscript(page);

    const blocks = dialogueTimelineBlocks(page);
    const count = await blocks.count();
    test.skip(count < 3, "Need at least 3 dialogue timeline blocks.");

    await blocks.first().dispatchEvent("click");
    await blocks.nth(count - 1).dispatchEvent("click");

    await expect(activeTranscriptLine(page)).toHaveCount(1);
    await expect(activeDialogueTimelineBlock(page)).toHaveCount(1);

    await expect.poll(async () => page.evaluate(() => {
      const active = document.querySelector(".hammer-transcript-doc-seg.is-active");
      const container = active?.closest(".hammer-bay-body");
      if (!(container instanceof HTMLElement) || !(active instanceof HTMLElement)) return false;
      const containerRect = container.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const topRatio = (activeRect.top - containerRect.top) / containerRect.height;
      const bottomRatio = (activeRect.bottom - containerRect.top) / containerRect.height;
      return topRatio >= 0.1 && bottomRatio <= 0.9;
    })).toBe(true);
  });
});

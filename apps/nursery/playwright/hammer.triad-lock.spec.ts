import { expect, test, type Locator, type Page } from "playwright/test";

const WORKSPACE_ID = process.env.FORGE_TEST_HAMMER_WORKSPACE_ID ?? process.env.FORGE_TEST_WORKSPACE_ID ?? "";
const WORKPIECE_ID = process.env.FORGE_TEST_HAMMER_WORKPIECE_ID ?? "";

async function openHammerEditor(page: Page): Promise<void> {
  await page.goto(
    `/app/hammer/editor?workspace_id=${encodeURIComponent(WORKSPACE_ID)}&workpiece_id=${encodeURIComponent(WORKPIECE_ID)}`,
  );
  await expect(page.locator("section.hammer-source-bay")).toBeVisible();
  await expect(page.locator("section.hammer-preview-bay")).toBeVisible();
  await expect(page.locator("section.hammer-timeline-dock")).toBeVisible();
}

function transcriptLines(page: Page): Locator {
  return page.locator(".hammer-transcript-line");
}

function activeTranscriptLine(page: Page): Locator {
  return page.locator(".hammer-transcript-line.is-active");
}

function dialogueTimelineBlocks(page: Page): Locator {
  return page.locator(".hammer-timeline-block--dialogue");
}

function activeDialogueTimelineBlock(page: Page): Locator {
  return page.locator(".hammer-timeline-block--dialogue.is-active");
}

async function requireEditableTranscript(page: Page, minimumLines = 6): Promise<void> {
  await expect(page.getByRole("button", { name: "Transcript" })).toBeVisible();
  await page.getByRole("button", { name: "Transcript" }).click();
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
    const targetSpeaker = (await targetLine.locator(".hammer-transcript-line__speaker").textContent())?.trim() ?? "";
    await targetLine.click();

    await expect(activeTranscriptLine(page)).toHaveCount(1);
    await expect(activeDialogueTimelineBlock(page)).toHaveCount(1);
    await expect(activeTranscriptLine(page)).toContainText(targetSpeaker.replace(/:$/, ""));

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

    const playhead = page.getByLabel("Timeline playhead");
    await expect(playhead).toBeVisible();
    const max = Number(await playhead.getAttribute("max"));
    expect(Number.isFinite(max)).toBe(true);

    const seenActive = new Set<string>();
    const steps = [0.12, 0.16, 0.2, 0.24, 0.28, 0.32];
    for (const ratio of steps) {
      const value = Number((max * ratio).toFixed(1));
      await playhead.evaluate((element, v) => {
        const input = element as HTMLInputElement;
        input.value = String(v);
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }, value);
      await page.waitForTimeout(60);
      const activeText = ((await activeTranscriptLine(page).locator(".hammer-transcript-line__text").textContent()) ?? "").trim();
      if (activeText) seenActive.add(activeText);
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
    await expect(blocks.first()).toBeVisible();
    const count = await blocks.count();
    test.skip(count < 3, "Need at least 3 dialogue timeline blocks.");

    await blocks.first().click();
    await blocks.nth(count - 1).click();

    await expect(activeTranscriptLine(page)).toHaveCount(1);
    await expect(activeDialogueTimelineBlock(page)).toHaveCount(1);

    const comfortBandOk = await page.evaluate(() => {
      const container = document.querySelector("section.hammer-source-bay .hammer-bay-body");
      const active = document.querySelector(".hammer-transcript-line.is-active");
      if (!container || !active) return null;
      const containerRect = container.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const topRatio = (activeRect.top - containerRect.top) / containerRect.height;
      const bottomRatio = (activeRect.bottom - containerRect.top) / containerRect.height;
      return topRatio >= 0.1 && bottomRatio <= 0.9;
    });
    expect(comfortBandOk).toBe(true);
  });
});

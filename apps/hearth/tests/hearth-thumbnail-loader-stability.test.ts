import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { readEpisodePackageForWorkpiece } from "../src/lib/hearth-thumbnail-api";

function createWindowStub() {
  return {
    location: { search: "" },
    localStorage: {
      getItem: () => null,
      key: () => null,
      length: 0,
    },
    __forgeTongsApiToken: "test-token",
  } as unknown as Window & typeof globalThis;
}

test("hearth thumbnail loader: metadata fetch failures resolve into handled errors", async () => {
  const globalWithWindow = globalThis as typeof globalThis & { window?: Window & typeof globalThis };
  const originalWindow = globalWithWindow.window;
  const originalFetch = globalThis.fetch;

  globalWithWindow.window = createWindowStub();
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };

  try {
    const result = await readEpisodePackageForWorkpiece("9287963f-e82a-4d9a-b810-db100e9d0021");
    assert.equal(result.ok, false);
    if (result.ok) {
      assert.fail("Expected metadata read failure to return an error result.");
    }
    assert.equal(result.status, 0);
    assert.match(result.error, /unable to read episode metadata/i);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalWithWindow, "window");
    } else {
      globalWithWindow.window = originalWindow;
    }
  }
});

test("hearth thumbnail loader: refresh callback is not memoized on the entire args bag", () => {
  const source = readFileSync(resolve(process.cwd(), "src/hooks/visuals/useEpisodePackageLoader.ts"), "utf8");
  assert.match(source, /latestArgsRef/);
  assert.doesNotMatch(source, /return useCallback\([\s\S]*?\},\s*\[args\]\);/);
  assert.match(source, /\},\s*\[args\.workpieceId\]\);/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  resolveTongsUserAccessToken,
  subscribeToForgeUserAccessToken,
} from "../src/lib/tongs-fetch";

const panel = readFileSync(
  new URL(
    "../src/components/visuals/CanonicalReferenceMaterialPanel.tsx",
    import.meta.url,
  ),
  "utf8",
);
const rolloutPanel = readFileSync(
  new URL(
    "../src/components/visuals/ReferenceClipPlanPanel.tsx",
    import.meta.url,
  ),
  "utf8",
);
const shell = readFileSync(
  new URL("../src/routes/HearthShell.tsx", import.meta.url),
  "utf8",
);

test("shell session hydration retries the canonical Reference Material loader", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const token = `header.${Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }),
  ).toString("base64url")}.signature`;
  let session: { access_token: string } | null = null;
  let authListener: ((event: string, value: unknown) => void) | null = null;
  let retries = 0;
  let unsubscribed = false;

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: () => null,
        key: () => null,
        length: 0,
      },
      __forge_supabase_client__: {
        auth: {
          getSession: async () => ({ data: { session } }),
          refreshSession: async () => ({ data: { session } }),
          onAuthStateChange: (
            listener: (event: string, value: unknown) => void,
          ) => {
            authListener = listener;
            return {
              data: {
                subscription: {
                  unsubscribe: () => {
                    unsubscribed = true;
                  },
                },
              },
            };
          },
        },
      },
    },
  });

  try {
    assert.equal(await resolveTongsUserAccessToken(), null);
    const unsubscribe = subscribeToForgeUserAccessToken(() => {
      retries += 1;
    });

    session = { access_token: token };
    assert.ok(authListener, "the Reference Material loader must subscribe to shell auth");
    authListener("SIGNED_IN", session);

    assert.equal(retries, 1);
    assert.equal(await resolveTongsUserAccessToken(), token);
    unsubscribe();
    assert.equal(unsubscribed, true);
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
});

test("Reference Material binds shell-auth hydration to a canonical reload", () => {
  assert.match(panel, /subscribeToForgeUserAccessToken\(listener\)/);
  assert.match(panel, /const listener = \(\) => void refresh\(\)/);
  assert.match(panel, /sequence !== refreshSequence\.current/);
  assert.match(panel, /unsubscribeFromAuth\(\)/);
  assert.match(
    rolloutPanel,
    /subscribeToForgeUserAccessToken\(refreshRollout\)/,
  );
  assert.match(shell, /subscribeToForgeUserAccessToken\(\(\) => \{/);
  assert.match(shell, /authorityState: canonicalReferenceClipAuthorityState/);
  assert.match(shell, /authorityState: canonicalReferenceVisualAuthorityState/);
  assert.match(shell, /canonicalAuthorityExists: Boolean\(canonicalReferenceClipState\?\.planRevisionId \|\| canonicalReferenceVisualState\?\.planRevisionId\)/);
  assert.match(shell, /canonicalReferenceClipRefreshSequence\.current \+= 1/);
  assert.match(shell, /canonicalReferenceVisualRefreshSequence\.current \+= 1/);
});

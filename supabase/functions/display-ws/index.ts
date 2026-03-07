import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function closeWith(ws: WebSocket, code: number, reason: string) {
  try {
    ws.close(code, reason);
  } catch (_) {
    // ignore
  }
}

function isExpired(expiresAt: unknown): boolean {
  if (!expiresAt) return false;
  const d = new Date(String(expiresAt));
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() <= Date.now();
}

Deno.serve(async (req) => {
  const upgrade = req.headers.get("upgrade") || "";
  if (upgrade.toLowerCase() !== "websocket") {
    return json(400, {
      error: "websocket_required",
      message: "This endpoint only accepts WebSocket upgrade requests.",
    });
  }

  const url = new URL(req.url);
  const pair = url.searchParams.get("pair")?.trim();
  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.addEventListener("open", async () => {
    try {
      if (!pair) {
        closeWith(socket, 4003, "missing pair token");
        return;
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !serviceRoleKey) {
        closeWith(socket, 1011, "server configuration missing");
        return;
      }

      const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
        global: {
          headers: {
            "Accept-Profile": "public",
            "Content-Profile": "public",
          },
        },
      });

      const { data, error } = await admin
        .from("display_pair_sessions")
        .select("token, expires_at")
        .eq("token", pair)
        .maybeSingle();

      if (error) {
        closeWith(socket, 1011, "db error");
        return;
      }
      if (!data?.token) {
        closeWith(socket, 4003, "invalid token");
        return;
      }
      if (isExpired((data as { expires_at?: unknown }).expires_at)) {
        closeWith(socket, 4003, "expired token");
        return;
      }

      try {
        await admin
          .from("display_pair_sessions")
          .update({ metadata: { connected_at: new Date().toISOString() } })
          .eq("token", pair);
      } catch (_) {
        // ignore
      }

      socket.send(JSON.stringify({ type: "ready", pair }));
    } catch (_) {
      closeWith(socket, 1011, "server error");
    }
  });

  socket.addEventListener("message", (evt) => {
    try {
      const text = typeof evt.data === "string" ? evt.data : "";
      if (text === "ping") {
        socket.send("pong");
        return;
      }
      socket.send(text);
    } catch (_) {
      // ignore
    }
  });

  socket.addEventListener("error", () => {
    // no-op
  });

  return response;
});

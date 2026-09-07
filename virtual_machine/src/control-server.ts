import http from "node:http";

export interface ControlHandlers {
  setAgentMuted: (muted: boolean) => void;
  leave: () => void;
}

export function startControlServer(
  port: number,
  handlers: ControlHandlers,
): http.Server {
  const server = http.createServer((req, res) => {
    const send = (code: number, body: string): void => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(body);
    };
    const readBody = (): Promise<string> =>
      new Promise((resolve) => {
        let data = "";
        req.on("data", (chunk: Buffer) => {
          data += chunk.toString();
        });
        req.on("end", () => resolve(data));
      });

    (async () => {
      if (req.method === "POST" && req.url === "/mute") {
        const body = JSON.parse((await readBody()) || "{}") as { muted?: unknown };
        handlers.setAgentMuted(Boolean(body.muted));
        send(200, JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === "POST" && req.url === "/leave") {
        handlers.leave();
        send(200, JSON.stringify({ ok: true }));
        return;
      }
      send(404, JSON.stringify({ ok: false }));
    })().catch(() => send(500, JSON.stringify({ ok: false })));
  });

  server.listen(port, "127.0.0.1");
  return server;
}
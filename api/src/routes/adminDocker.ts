// src/routes/adminDocker.ts
import express, { Request, Response } from "express";
import { spawn } from "child_process";

const router = express.Router();
const ADMIN_KEY = process.env.ADMIN_SYNC_KEY || "";
const COMPOSE_FILE = process.env.DOCKER_COMPOSE_FILE || "docker-compose.yml";
const WORKDIR = process.env.DOCKER_WORKDIR || process.cwd();

function auth(req: Request, res: Response, next: any) {
  const key = req.header("x-admin-key") || (req.query.key as string);
  if (!ADMIN_KEY || key !== ADMIN_KEY) return res.status(401).json({ error: "unauthorized" });
  next();
}

function sse(res: Response) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  // @ts-ignore
  res.flushHeaders?.();
}

function streamCmd(req: Request, res: Response, cmd: string, args: string[], label: string) {
  sse(res);
  const child = spawn(cmd, args, { cwd: WORKDIR, env: process.env });

  const send = (event: string, data: string) => {
    const lines = String(data).replace(/\r/g, "").split("\n");
    for (const line of lines) {
      if (!line) continue;
      res.write(`event: ${event}\n`);
      res.write(`data: ${line}\n\n`);
    }
  };

  send("info", `▶ ${label}: ${cmd} ${args.join(" ")}`);

  child.stdout.on("data", (b) => send("out", b.toString()));
  child.stderr.on("data", (b) => send("err", b.toString()));
  child.on("close", (code) => {
    send("done", `exit ${code}`);
    res.end();
  });

  req.on("close", () => { try { child.kill("SIGTERM"); } catch {} });
}

// GET /admin/docker/api/build  → docker compose build --no-cache api
router.get("/admin/docker/api/build", auth, (req, res) => {
  streamCmd(req, res, "docker", ["compose", "-f", COMPOSE_FILE, "build", "--no-cache", "api"], "build --no-cache");
});

// GET /admin/docker/api/up  → docker compose up -d api
router.get("/admin/docker/api/up", auth, (req, res) => {
  streamCmd(req, res, "docker", ["compose", "-f", COMPOSE_FILE, "up", "-d", "api"], "up -d");
});

// GET /admin/docker/api/logs  → docker compose logs --tail=80 -f api
router.get("/admin/docker/api/logs", auth, (req, res) => {
  const tail = String(req.query.tail ?? "80");
  streamCmd(req, res, "docker", ["compose", "-f", COMPOSE_FILE, "logs", `--tail=${tail}`, "-f", "api"], `logs --tail=${tail} -f`);
});

// convenience: build then up in one stream
router.get("/admin/docker/api/rebuild-and-up", auth, (req, res) => {
  sse(res);
  const step = (cmd: string, args: string[], label: string, next?: () => void) => {
    const child = spawn(cmd, args, { cwd: WORKDIR, env: process.env });
    const send = (event: string, data: string) => {
      const lines = String(data).replace(/\r/g, "").split("\n");
      for (const line of lines) {
        if (!line) continue;
        res.write(`event: ${event}\n`);
        res.write(`data: ${line}\n\n`);
      }
    };
    send("info", `▶ ${label}: ${cmd} ${args.join(" ")}`);
    child.stdout.on("data", (b) => send("out", b.toString()));
    child.stderr.on("data", (b) => send("err", b.toString()));
    child.on("close", (code) => {
      send("info", `${label} exit ${code}`);
      if (code === 0 && next) next();
      else { send("done", `exit ${code}`); res.end(); }
    });
    // @ts-ignore
    req.on("close", () => child.kill("SIGTERM"));
  };

  step("docker", ["compose", "-f", COMPOSE_FILE, "build", "--no-cache", "api"], "build", () => {
    step("docker", ["compose", "-f", COMPOSE_FILE, "up", "-d", "api"], "up -d", () => {
      res.write(`event: done\ndata: all steps complete\n\n`);
      res.end();
    });
  });
});

export default router;

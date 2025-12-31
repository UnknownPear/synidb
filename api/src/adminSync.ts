// routes/adminDocker.ts
import { Router, Request, Response } from "express";
import { spawn } from "child_process";
import path from "path";

const router = Router();

function requireAdmin(req: Request) {
  const key = req.header("x-admin-key");
  const expected = process.env.ADMIN_SYNC_KEY || "";
  if (!expected || key !== expected) {
    const err: any = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
}

type RunOut = { code: number; stdout: string; stderr: string };
function run(cmd: string, args: string[], cwd?: string): Promise<RunOut> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      cwd: cwd || process.env.DOCKER_COMPOSE_CWD || process.cwd(),
      env: process.env,
    });
    let stdout = "", stderr = "";
    p.stdout.on("data", d => (stdout += d.toString()));
    p.stderr.on("data", d => (stderr += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

/** POST /admin/docker/build  body: { service?: string; noCache?: boolean } */
router.post("/build", async (req: Request, res: Response) => {
  try {
    requireAdmin(req);
    const service = String(req.body?.service ?? "api");
    const noCache = Boolean(req.body?.noCache ?? true);
    const args = ["compose", "build"];
    if (noCache) args.push("--no-cache");
    args.push(service);
    const out = await run("docker", args);
    res.status(out.code === 0 ? 200 : 500).json(out);
  } catch (e: any) {
    res.status(e?.status || 500).json({ error: e?.message || "build failed" });
  }
});

/** POST /admin/docker/up  body: { service?: string; detach?: boolean } */
router.post("/up", async (req: Request, res: Response) => {
  try {
    requireAdmin(req);
    const service = String(req.body?.service ?? "api");
    const detach = Boolean(req.body?.detach ?? true);
    const args = ["compose", "up"];
    if (detach) args.push("-d");
    args.push(service);
    const out = await run("docker", args);
    res.status(out.code === 0 ? 200 : 500).json(out);
  } catch (e: any) {
    res.status(e?.status || 500).json({ error: e?.message || "up failed" });
  }
});

/** POST /admin/docker/logs  body: { service?: string; tail?: number } */
router.post("/logs", async (req: Request, res: Response) => {
  try {
    requireAdmin(req);
    const service = String(req.body?.service ?? "api");
    const tail = Number(req.body?.tail ?? 80) || 80;
    const out = await run("docker", ["compose", "logs", `--tail=${tail}`, service]);
    res.status(out.code === 0 ? 200 : 500).json(out);
  } catch (e: any) {
    res.status(e?.status || 500).json({ error: e?.message || "logs failed" });
  }
});

export default router;

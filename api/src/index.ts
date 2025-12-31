// Load .env for local development only. In production, rely on real environment variables.
if (process.env.NODE_ENV !== "production") {
  const { config } = await import("dotenv");
  config();
}


import express from "express";
import cors from "cors";
import { Prisma, PrismaClient } from "@prisma/client";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import rateLimit from "express-rate-limit"; // Snyk Fix: Import

const sh = promisify(exec);
const app = express();

// Snyk Fix: Define rate limiters
const syncRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // Limit to 5 requests per minute
  message: { error: "Too many sync requests, please try again later." }
});

const dockerRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Too many docker operations, please wait." }
});

/* ───────────────────────── Ensure res helpers always exist ────────────────── */
app.use((req, res, next) => {
  const r: any = res;
  if (typeof r.status !== "function") {
    r.status = (code: number) => { res.statusCode = code; return r; };
  }
  if (typeof r.set !== "function") {
    r.set = (k: string, v: string) => { res.setHeader(k, v); return r; };
  }
  if (typeof r.json !== "function") {
    r.json = (obj: any) => {
      if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(obj));
      return r;
    };
  }
  if (typeof r.send !== "function") {
    r.send = (body: any) => {
      if (typeof body === "object" && body !== null) {
        if (!res.getHeader("Content-Type")) res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(body));
      } else {
        res.end(String(body ?? ""));
      }
      return r;
    };
  }
  next();
});

const prisma = new PrismaClient();

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const ADMIN_SYNC_KEY = process.env.ADMIN_SYNC_KEY || "";

/* ───────────────────────── Common middleware ───────────────────────── */
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "2mb" }));

/* ───────────────────────── Ultra-minimal probe ─────────────────────── */
app.get("/__up", (_req, res) => {
  res.status(200).json({ ok: true, pid: process.pid, cwd: process.cwd() });
});

/* ───────────────────────── Admin router (JSON only) ────────────────── */
const admin = express.Router();

function allow(req: express.Request) {
  return ADMIN_SYNC_KEY && req.headers["x-admin-key"] === ADMIN_SYNC_KEY;
}

/** Resolve prisma schema path without using __dirname (works in CJS/ESM/TS) */
function resolveSchemaPath(): string | null {
  const fromEnv = process.env.PRISMA_SCHEMA?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  const guesses = [
    "prisma/schema.prisma",
    "api/prisma/schema.prisma",
    "../prisma/schema.prisma",
    "../api/prisma/schema.prisma",
  ].map((p) => path.resolve(process.cwd(), p));

  for (const g of guesses) if (fs.existsSync(g)) return g;
  return null;
}

admin.get("/ping", async (_req, res) => {
  const sp = resolveSchemaPath();
  res.status(200).json({
    ok: true,
    node: process.version,
    cwd: process.cwd(),
    dbUrlSet: Boolean(process.env.DATABASE_URL),
    hasAdminKey: Boolean(ADMIN_SYNC_KEY),
    schemaPath: sp,
    schemaExists: Boolean(sp && fs.existsSync(sp!)),
  });
});

// Snyk Fix: Applied syncRateLimiter to potentially heavy operation
admin.post("/sync-prisma", syncRateLimiter, async (req, res) => {
  try {
    if (!allow(req)) return res.status(403).json({ ok: false, error: "forbidden" });

    const schema = resolveSchemaPath();
    if (!schema) return res.status(400).json({ ok: false, error: "schema.prisma not found" });

    const cmd = `npx prisma db pull --schema "${schema}" && npx prisma generate --schema "${schema}"`;
    const { stdout, stderr } = await sh(cmd, { cwd: process.cwd(), env: process.env });
    return res.status(200).json({ ok: true, stdout, stderr, schema });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

app.use("/admin", admin);

/* ───────────────────────── Admin → Docker compose controls ─────────── */
import { spawn } from "child_process";

function requireAdmin(req: express.Request) {
  if (!ADMIN_SYNC_KEY || req.headers["x-admin-key"] !== ADMIN_SYNC_KEY) {
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

const docker = express.Router();

/** POST /admin/docker/build  { service?: string; noCache?: boolean } */
// Snyk Fix: Applied dockerRateLimiter
docker.post("/build", dockerRateLimiter, async (req, res) => {
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

/** POST /admin/docker/up  { service?: string; detach?: boolean } */
// Snyk Fix: Applied dockerRateLimiter
docker.post("/up", dockerRateLimiter, async (req, res) => {
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

/** POST /admin/docker/logs  { service?: string; tail?: number } */
// Snyk Fix: Applied dockerRateLimiter
docker.post("/logs", dockerRateLimiter, async (req, res) => {
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

app.use("/admin/docker", docker);

/* ───────────────────────────────── Health (simple) ─────────────────── */
app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || String(e) });
  }
});

/* ───────────────────────────────── SSE Hub ─────────────────────────── */
type SseClient = { id: number; res: express.Response };
let clients: SseClient[] = [];
let nextClientId = 1;

function sendEvent(name: string, data: any) {
  const payload = `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const c of clients) c.res.write(payload);
}

app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  (res as any).flushHeaders?.();

  const id = nextClientId++;
  clients.push({ id, res });
  res.write(`event: hello\ndata: "connected"\n\n`);

  const close = () => (clients = clients.filter((c) => c.id !== id));
  req.on("close", close);
  res.on("close", close);
  res.on("finish", close);
});

/* ───────────────────────────────── Grades ──────────────────────────── */
type Grade = "A" | "B" | "C" | "D" | "P";
const GRADES: readonly Grade[] = ["A", "B", "C", "D", "P"] as const;
const LEGACY_TO_GRADE: Record<string, Grade> = {
  excellent: "A",
  good: "B",
  fair: "C",
  rough: "D",
  "for parts": "P",
  parts: "P",
  "as is": "P",
  "as-is": "P",
  "not working": "P",
  "non working": "P",
  "doesn't power": "P",
  "wont power": "P",
  "won't boot": "P",
};
function normalizeGrade(x?: string | null): Grade {
  if (!x) return "B";
  const s = String(x).trim();
  const u = s.toUpperCase();
  if ((GRADES as readonly string[]).includes(u)) return u as Grade;
  return LEGACY_TO_GRADE[s.toLowerCase()] ?? "B";
}
const formatSynergyId = (prefix: string, n: number) =>
  `${prefix}-${String(n).padStart(4, "0")}`;

/* ─────────────────────────────── Categories ────────────────────────── */
app.get("/categories", async (_req, res, next) => {
  try {
    const categories = await prisma.category.findMany({ orderBy: { label: "asc" } });
    res.json(categories);
  } catch (e) { next(e); }
});

app.post("/categories", async (req, res, next) => {
  try {
    const { label, prefix } = req.body ?? {};
    if (!label || !prefix) return res.status(400).json({ error: "label and prefix required" });
    const created = await prisma.category.create({ data: { label, prefix } });
    sendEvent("category.created", created);
    res.status(201).json(created);
  } catch (e) { next(e); }
});

app.patch("/categories/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const before = await prisma.category.findUnique({ where: { id } as any });
    if (!before) return res.status(404).json({ error: "not found" });
    const after = await prisma.category.update({ where: { id } as any, data: (req.body ?? {}) });
    sendEvent("category.updated", { before, after });
    res.json(after);
  } catch (e) { next(e); }
});

app.delete("/categories/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.category.delete({ where: { id } as any });
    sendEvent("category.deleted", { id });
    res.status(204).end();
  } catch (e) { next(e); }
});

/* ───────────────────────────── Inventory Rows ──────────────────────── */
type RowPayload = {
  synergyId: string;
  category?: string;           // optional on update
  productName?: string;        // optional on update
  grade?: Grade;
  testedBy?: string | null;
  testedDate?: string | null;
  testerComment?: string | null;
  specs?: Prisma.InputJsonValue | null;
  price?: number | null;
  ebayPrice?: number | null;
  posted?: boolean | null;
  postedAt?: string | null;
  postedBy?: string | null;
};

/** Build safe create input (no undefined) and validate required fields */
function buildCreate(p: RowPayload): Prisma.InventoryRowCreateInput {
  if (!p.synergyId) throw new Error("synergyId required");
  if (!p.category) throw new Error("category required for create");
  if (!p.productName) throw new Error("productName required for create");

  return {
    synergyId: p.synergyId,
    categoryLbl: p.category,
    productName: p.productName,
    grade: normalizeGrade(p.grade),
    testedBy: p.testedBy ?? null,
    testedDate: p.testedDate ?? null,
    testerComment: p.testerComment ?? null,
    specs: (p.specs ?? null) as Prisma.InputJsonValue | null,
    price: p.price ?? null,
    ebayPrice: p.ebayPrice ?? null,
    posted: Boolean(p.posted ?? false),
    postedAt: p.postedAt ?? null,
    postedBy: p.postedBy ?? null,
  };
}

/** Build safe update input (omit all undefined fields) */
function buildUpdate(p: RowPayload): Prisma.InventoryRowUpdateInput {
  const data: Prisma.InventoryRowUpdateInput = {};

  if (p.category !== undefined) data.categoryLbl = p.category!;
  if (p.productName !== undefined) data.productName = p.productName!;
  if (p.grade !== undefined) data.grade = normalizeGrade(p.grade);

  if (p.testedBy !== undefined) data.testedBy = p.testedBy ?? null;
  if (p.testedDate !== undefined) data.testedDate = p.testedDate ?? null;
  if (p.testerComment !== undefined) data.testerComment = p.testerComment ?? null;
  if (p.specs !== undefined) data.specs = (p.specs ?? null) as Prisma.InputJsonValue | null;

  if (p.price !== undefined) data.price = p.price ?? null;
  if (p.ebayPrice !== undefined) data.ebayPrice = p.ebayPrice ?? null;

  if (p.posted !== undefined) data.posted = Boolean(p.posted);
  if (p.postedAt !== undefined) data.postedAt = p.postedAt ?? null;
  if (p.postedBy !== undefined) data.postedBy = p.postedBy ?? null;

  return data;
}

app.get("/rows", async (_req, res, next) => {
  try {
    const rows = await prisma.inventoryRow.findMany({ orderBy: { synergyId: "asc" } });
    res.json(rows);
  } catch (e) { next(e); }
});

app.put("/rows", async (req, res, next) => {
  try {
    const payload = (Array.isArray(req.body) ? req.body : []) as RowPayload[];
    if (!payload.length) return res.json({ count: 0 });

    // Split into creates versus updates
    const ids = payload.map((r) => r.synergyId).filter(Boolean) as string[];
    const existing = await prisma.inventoryRow.findMany({
      where: { synergyId: { in: ids } },
      select: { synergyId: true },
    });
    const existingSet = new Set(existing.map((r) => r.synergyId));

    const creates: RowPayload[] = [];
    const updates: RowPayload[] = [];
    for (const r of payload) {
      if (!r?.synergyId) {
        return res.status(400).json({ error: "synergyId required for every row" });
      }
      if (existingSet.has(r.synergyId)) updates.push(r);
      else creates.push(r);
    }

    // Validate create-required fields
    for (const c of creates) {
      if (!c.category || !c.productName) {
        return res.status(400).json({
          error: `create requires category and productName (synergyId=${c.synergyId})`,
        });
      }
    }

    await prisma.$transaction([
      ...creates.map((c) => prisma.inventoryRow.create({ data: buildCreate(c) })),
      ...updates.map((u) =>
        prisma.inventoryRow.update({ where: { synergyId: u.synergyId }, data: buildUpdate(u) })
      ),
    ]);

    sendEvent("row.bulkUpserted", { count: payload.length, creates: creates.length, updates: updates.length });
    res.json({ count: payload.length, creates: creates.length, updates: updates.length });
  } catch (e) { next(e); }
});

app.delete("/rows/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    await prisma.inventoryRow.delete({ where: { synergyId: id } });
    sendEvent("row.deleted", { synergyId: id });
    res.status(204).end();
  } catch (e) { next(e); }
});

/* ───────────────────────────── Prefix Counters ─────────────────────── */
app.get("/prefix/:prefix/peek", async (req, res, next) => {
  try {
    const { prefix } = req.params;
    const ctr = await prisma.prefixCounter.upsert({
      where: { prefix },
      update: {},
      create: { prefix, nextNum: 1 },
    });
    res.type("text/plain").send(formatSynergyId(prefix, ctr.nextNum));
  } catch (e) { next(e); }
});

app.post("/prefix/:prefix/take", async (req, res, next) => {
  try {
    const { prefix } = req.params;
    const synergyId = await prisma.$transaction(async (tx) => {
      await tx.prefixCounter.upsert({
        where: { prefix },
        update: {},
        create: { prefix, nextNum: 1 },
      });
      const ctr = await tx.prefixCounter.update({
        where: { prefix },
        data: { nextNum: { increment: 1 } },
      });
      const assignedNum = ctr.nextNum - 1;
      const id = formatSynergyId(prefix, assignedNum);
      await tx.allocatedId.create({ data: { synergyId: id, prefix } });
      return id;
    });
    res.type("text/plain").send(synergyId);
  } catch (e) { next(e); }
});

app.post("/prefix/:prefix/set", async (req, res, next) => {
  try {
    const { prefix } = req.params;
    const next = Math.max(1, Math.floor(Number((req.body ?? {}).next)));
    const updated = await prisma.prefixCounter.upsert({
      where: { prefix },
      update: { nextNum: next },
      create: { prefix, nextNum: next },
    });
    sendEvent("prefix.set", { prefix, next: updated.nextNum });
    res.json({ prefix, next: updated.nextNum });
  } catch (e) { next(e); }
});

/* ───────────────────────── Error handler (JSON) ────────────────────── */
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[ERROR]", err);
  res.status(500).json({ error: err?.message || "Internal Server Error" });
});

/* ───────────────────────── Boot ────────────────────────────────────── */
app.listen(PORT, HOST, () => {
  console.log(`API on http://${HOST}:${PORT}`);
});
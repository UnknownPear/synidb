import { GoogleGenerativeAI } from "@google/generative-ai";

// --- Gemini setup ---
// Fix: Handle comma-separated keys from the environment variable
const envVar = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
const keys = envVar ? envVar.split(",").map((k) => k.trim()).filter((k) => k.length > 0) : [];

// Pick one key randomly to distribute load
const API_KEY = keys.length > 0 ? keys[Math.floor(Math.random() * keys.length)] : undefined;

const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;
const MODEL_NAME = "gemini-2.5-flash"; // Use stable 1.5 Flash

// ---------- Types ----------
export type TitleDescInput = {
  productName: string;
  brand?: string;
  model?: string;
  category?: string;   // e.g., "Phones", "Laptops"
  condition: string;   // e.g., "Excellent", "Good", "Fair", "Rough", "For parts"
  specs?: {
    processor?: string;
    ram?: string;
    storage?: string;
    screen?: string;
    battery?: string;
  };
  testerComment?: string;
  included?: string;
};

type Blocks = {
  condition: string;        // 1 concise sentence
  functionality: string[];  // 2–5 test-result lines (no specs)
  included: string;         // what's in the box
};

// ---------- Title ----------
function buildTitlePrompt(input: TitleDescInput) {
  const { productName, condition, specs, testerComment } = input;
  return [
    "You are a professional e-commerce title writer for eBay.",
    "Write a concise title (≤ 80 chars), no emojis, no ALL CAPS.",
    "Include brand/model, RAM, storage; optionally one key condition/cosmetic note.",
    "Do not use quotes. No SKU or ID.",
    "Use ` | ` to separate specs, e.g.: MacBook Pro 16 M2 | 16GB | 512GB SSD | **MINOR BOTTOM SCUFFS**",
    "Put the brief condition/cosmetic note in **DOUBLE ASTERISKS** and in CAPS.",
    "",
    `Product: ${productName}`,
    `Condition: ${condition}`,
    `Specs: ${[
      specs?.processor && `CPU ${specs.processor}`,
      specs?.ram && specs.ram,
      specs?.storage && specs.storage,
      specs?.screen && specs.screen,
      specs?.battery && `Battery ${specs.battery}`,
    ]
      .filter(Boolean)
      .join(", ") || "—"}`,
    `Key Note: ${testerComment || "—"}`,
    "",
    "Return only the title text.",
  ].join("\n");
}

export async function generateTitle(input: TitleDescInput): Promise<string> {
  if (!genAI) return input.productName;
  try {
    const model = genAI.getGenerativeModel({ model: MODEL_NAME });
    const res = await model.generateContent(buildTitlePrompt(input));
    const text = res.response.text().trim();
    return text.replace(/^["“]|["”]$/g, "").replace(/\s+/g, " ").trim();
  } catch (e) {
    console.error("AI Title Gen failed:", e);
    return input.productName;
  }
}

// ---------- Blocks (Condition, Functionality[], Included) ----------
function buildFunctionalBlocksPrompt(input: TitleDescInput) {
  return [
    "You are assisting with an eBay listing using a fixed template.",
    "Write 3 things based on the details:",
    "1) 'Condition' — 1 concise factual sentence (e.g., 'Excellent condition with minor scuffs on the bottom.').",
    "2) 'Functionality' — 2–5 short bullet lines describing TEST RESULTS ONLY (what works/doesn't).",
    "   IMPORTANT: Do NOT include fixed hardware specs (RAM, storage, CPU, screen size) in Functionality.",
    "   DO NOT include trivial items like 'Power button works' or 'Volume buttons work'.",
    "   Prefer high-signal points: 'Battery ~85% health', 'Screen burn-in', 'Face ID not working', 'Ports tested ok'.",
    "3) 'Included' — what's in the box (e.g., 'Device only', 'Laptop + charger', 'Phone + cable').",
    "Keep it neutral, accurate, and non-hypey.",
    "",
    `Product: ${input.productName}`,
    `Category: ${input.category || "—"}`,
    `Condition (raw): ${input.condition}`,
    `Specs: ${JSON.stringify(input.specs ?? {}, null, 2)}`,
    `Tester Note: ${input.testerComment || "—"}`,
    `Included (if provided): ${input.included || "—"}`,
    "",
    "Return JSON with keys: condition (string), functionality (string[]), included (string).",
  ].join("\n");
}

// JSON parser (handles ```json fences etc.)
function parseJsonSafely(s: string): any | null {
  const str = (s || "").trim();
  try { return JSON.parse(str); } catch {}
  const m = str.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (m) { try { return JSON.parse(m[1]); } catch {} }
  const a = str.indexOf("{"), b = str.lastIndexOf("}");
  if (a !== -1 && b !== -1 && b > a) { try { return JSON.parse(str.slice(a, b + 1)); } catch {} }
  return null;
}

// ---------- Normalizer: force your house style for Functionality ----------
function normalizeFunctionality(opts: {
  category?: string;
  condition: string;
  testerComment?: string;
  rawBullets: string[];
}) {
  const { category, condition, testerComment } = opts;

  const isParts = /part|as[\s-]?is|non[-\s]?working|doesn'?t\s*power|won'?t\s*boot/i.test(
    condition
  );
  const issueNote = (testerComment || "").trim();

  // Remove junk/trivial & specs
  const filtered = (opts.rawBullets || [])
    .map(String)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter(
      (s) =>
        !/power button works|volume button|wifi works|bluetooth works only|camera opens only/i.test(
          s
        )
    )
    .filter(
      (s) =>
        !/(^|\s)(\d+\.?\d*)\s?gb\b|ssd|hdd|ram\b|ddr\d|\bstorage\b|\bcpu\b|\bprocessor\b|\bscreen\b|\bdisplay\b|\binch\b|\bips\b|\bhz\b/i.test(
          s
        )
    );

  // Lead bullet
  let lead = "";
  if (isParts) {
    lead = "NOT FULLY FUNCTIONAL — SOLD AS-IS / FOR PARTS";
  } else {
    lead = issueNote ? `FULLY FUNCTIONAL, ${issueNote}` : "FULLY FUNCTIONAL";
  }

  // Deduplicate if AI echoed the tester note again
  const seen = new Set<string>([lead.toLowerCase()]);
  const rest = filtered.filter((b) => !seen.has(b.toLowerCase()));

  // Phones-specific wording tweaks
  const normalized = [lead, ...rest].map((line) => {
    if ((category || "").toLowerCase().includes("phone")) {
      return line
        .replace(/screen burn\b/i, "screen burn-in")
        .replace(/ghost touch/i, "ghost-touch")
        .replace(/battery (bad|poor)/i, "battery weak");
    }
    return line;
  });

  // Ensure at least one more useful bullet
  if (normalized.length === 1) {
    normalized.push(
      isParts
        ? "Primary defect noted above; see photos for exact condition."
        : "All core functions tested (calls, audio, display, charge)."
    );
  }

  return normalized.slice(0, 4);
}

// ---------- Core: generateBlocks ----------
async function generateBlocks(input: TitleDescInput): Promise<Blocks> {
  let conditionOut = input.condition;
  let functionalityOut: string[] = [];
  let includedOut = input.included || "";

  if (genAI) {
    try {
      const res = await genAI
        .getGenerativeModel({ model: MODEL_NAME })
        .generateContent(buildFunctionalBlocksPrompt(input));
      const asJson = parseJsonSafely(res.response.text());
      if (asJson) {
        if (asJson.condition) conditionOut = String(asJson.condition);
        if (Array.isArray(asJson.functionality)) functionalityOut = asJson.functionality.map(String);
        if (asJson.included) includedOut = String(asJson.included);
      }
    } catch (e) {
      console.error("AI Blocks Gen failed:", e);
      // Fallback to local logic below
    }
  }

  // Defaults
  if (!includedOut) {
    const cat = (input.category || "").toLowerCase();
    if (cat.includes("phone")) includedOut = "Phone only";
    else if (cat.includes("laptop") || cat.includes("macbook"))
      includedOut = "Laptop only (charger if pictured)";
    else includedOut = "Device only";
  }
  if (functionalityOut.length === 0 && input.testerComment) {
    functionalityOut = [input.testerComment];
  }

  // Normalize to your style
  functionalityOut = normalizeFunctionality({
    category: input.category,
    condition: conditionOut,
    testerComment: input.testerComment,
    rawBullets: functionalityOut,
  });

  return { condition: conditionOut, functionality: functionalityOut, included: includedOut };
}

// ---------- Preview (HTML for display; we copy its **rendered HTML** elsewhere) ----------
export async function generatePreviewHTML(
  input: TitleDescInput,
  title: string
): Promise<string> {
  const blocks = await generateBlocks(input);
  const fnLis = blocks.functionality.map((s) => `<li>${escapeHtml(s)}</li>`).join("");

  return `
<div style="text-align:center; font-weight:700; font-size:20px; margin-bottom:10px;">
  (${escapeHtml(title || input.productName)})
</div>

<div style="font-weight:700; margin:6px 0 2px;">Condition:</div>
<ul style="margin:0 0 10px 22px; padding:0; list-style:disc;">
  <li>${escapeHtml(blocks.condition)}</li>
</ul>

<div style="font-weight:700; margin:6px 0 2px;">Functionality:</div>
<ul style="margin:0 0 10px 22px; padding:0; list-style:disc;">
  ${fnLis}
</ul>

<div style="font-weight:700; margin:6px 0 2px;">Included:</div>
<ul style="margin:0 0 16px 22px; padding:0; list-style:disc;">
  <li>${escapeHtml(blocks.included)}</li>
</ul>

<div style="text-align:center; margin:10px 0; font-weight:700;">
  ****International customers outside of the US may be subject to additional customs or duty fees.****
</div>

<div style="text-align:center; margin:10px 0;">
  Thanks for viewing our product. Don't forget to check out our eBay store for more great deals!
</div>

<div style="text-align:center; margin:10px 0;">
  <a href="https://www.ebay.com/str/discountharddrivesupply" rel="noopener noreferrer">click here for more great deals!</a>
</div>

<div style="margin-top:12px;">
  <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTOXbPUn7ArDbbFLj5oz4bz75tLImeJH0gERQ&s"
       alt="click here for more great deals!"
       style="display:block; margin:0 auto;" />
</div>
`.trim();
}

// ---------- utils ----------
function escapeHtml(s?: string) {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
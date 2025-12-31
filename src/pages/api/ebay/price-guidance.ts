import type { NextApiRequest, NextApiResponse } from "next";
import fetch from "node-fetch";

// Utility: build cleaner query
function buildQuery(productName: string, specs?: { ram?: string; storage?: string; processor?: string }) {
  const parts: string[] = [];
  if (specs?.processor) parts.push(specs.processor);
  if (specs?.ram) parts.push(specs.ram);
  if (specs?.storage) parts.push(specs.storage);
  parts.push(productName.replace(/\|/g, " ")); // strip pipes
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { query, ram, storage, processor } = req.query;
  if (!query) return res.status(400).json({ error: "Missing query" });

  const q = buildQuery(query as string, {
    ram: ram as string,
    storage: storage as string,
    processor: processor as string,
  });

  console.log("🔍 Price guidance request for:", q);

  try {
    const token = process.env.EBAY_OAUTH_TOKEN;
    const browseUrl = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(
      q
    )}&limit=20&filter=soldItems:true`;

    console.log("➡️ Calling Browse API:", browseUrl);

    const browseResp = await fetch(browseUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    console.log("📡 Browse API status:", browseResp.status);
    const browseData = await browseResp.json();

    let prices: number[] =
      browseData.itemSummaries
        ?.map((item: any) => parseFloat(item.price?.value))
        .filter((p: number) => !isNaN(p)) || [];

    console.log("📊 Browse API returned", prices.length, "prices");

    // Fallback: use Finding API if no results
    let sampleItems: { title: string; price: number }[] = [];
    if (!prices.length) {
      const findingUrl = `https://svcs.ebay.com/services/search/FindingService/v1?OPERATION-NAME=findCompletedItems&SERVICE-VERSION=1.0.0&SECURITY-APPNAME=${process.env.EBAY_APP_ID}&RESPONSE-DATA-FORMAT=JSON&keywords=${encodeURIComponent(
        q
      )}&itemFilter(0).name=SoldItemsOnly&itemFilter(0).value=true`;

      console.log("➡️ Calling Finding API:", findingUrl);

      const findingResp = await fetch(findingUrl);
      console.log("📡 Finding API status:", findingResp.status);

      const findingData = await findingResp.json();
      const items = findingData.findCompletedItems?.searchResult?.[0]?.item || [];

      console.log("📊 Finding API returned", items.length, "items");

      prices =
        items
          .map((i: any) => parseFloat(i.sellingStatus?.[0]?.currentPrice?.[0]?.__value__))
          .filter((p: number) => !isNaN(p)) || [];

      // save a few sample sold items for debugging
      sampleItems = items.slice(0, 5).map((i: any) => ({
        title: i.title?.[0],
        price: parseFloat(i.sellingStatus?.[0]?.currentPrice?.[0]?.__value__),
      }));
    } else {
      // also include samples from Browse API
      sampleItems = browseData.itemSummaries?.slice(0, 5).map((i: any) => ({
        title: i.title,
        price: parseFloat(i.price?.value),
      })) || [];
    }

    const avg = prices.length ? (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2) : null;
    const median = prices.length
      ? prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)].toFixed(2)
      : null;

    console.log("✅ Final results — avg:", avg, "median:", median, "count:", prices.length);

    res.status(200).json({
      avg,
      median,
      sampleCount: prices.length,
      samples: sampleItems, // ✅ return sample sold items too
    });
  } catch (err: any) {
    console.error("💥 API handler error:", err);
    res.status(500).json({ error: "Failed to fetch eBay sold comps" });
  }
}

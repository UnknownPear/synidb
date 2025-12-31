export async function refreshEbaySoldWhen(synergyId: string, days = 720) {
  const res = await fetch(`/backend/integrations/ebay/refresh-sold-when/${encodeURIComponent(synergyId)}?days=${days}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`ebay refresh failed: ${res.status}`);
  return res.json() as Promise<{
    ok: boolean;
    soldCount: number;
    lastSoldAt: string | null;
    seller?: string;
    listingStatus?: string;
  }>;
}
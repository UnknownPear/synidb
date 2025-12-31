// components/EbaySoldBadge.tsx
import * as React from "react";
import { refreshEbaySoldWhen } from "@/api/ebay";

export function EbaySoldBadge({ synergyId }: { synergyId: string }) {
  const [state, setState] = React.useState<{soldCount?:number; lastSoldAt?:string|null; seller?:string; listingStatus?:string; loading:boolean; error?:string;}>({loading:true});

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const j = await refreshEbaySoldWhen(synergyId, 720);
        if (alive) setState({ loading:false, soldCount:j.soldCount, lastSoldAt:j.lastSoldAt, seller:j.seller, listingStatus:j.listingStatus });
      } catch (e:any) {
        if (alive) setState({ loading:false, error:String(e?.message||e) });
      }
    })();
    return () => { alive = false; };
  }, [synergyId]);

  if (state.loading) return <span title="eBay">…</span>;
  if (state.error) return <span title="eBay error" style={{color:"#e5484d"}}>eBay ✖</span>;

  return (
    <span title={`Seller: ${state.seller||"-"} · Status: ${state.listingStatus||"-"} · Last: ${state.lastSoldAt||"—"}`}
          style={{display:"inline-flex",gap:8,alignItems:"center",padding:"2px 8px",border:"1px solid #1e2a3a",borderRadius:999,background:"#0f1824",color:"#e9eef5"}}>
      <strong>Sold</strong> {state.soldCount ?? 0}
      <span style={{opacity:.7,fontSize:12}}>{state.lastSoldAt ? new Date(state.lastSoldAt).toLocaleDateString() : "—"}</span>
    </span>
  );
}

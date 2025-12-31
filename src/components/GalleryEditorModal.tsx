import React, { useMemo, useRef, useState } from "react";
import { assetUrl, fetchGallery, GalleryItem, getDisplayGrade } from "@/lib/galleryClient";
import { uploadFiles, createLinks, updateLink, deleteLink, reorderLinks } from "@/lib/galleryEditorClient";

type Props = {
  open: boolean;
  onClose: () => void;
  // identify the subject (product OR part)
  synergyId?: string;
  partKey?: string;
  partField?: string; // default "partNumber"
  initialRows: GalleryItem[];   // pass what your viewer already fetched
  onRefresh: () => void;        // callback to refetch gallery after edits
};

export default function GalleryEditorModal({
  open, onClose, synergyId, partKey, partField, initialRows, onRefresh,
}: Props) {
  const [rows, setRows] = useState<GalleryItem[]>(initialRows);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const idKey = synergyId ? { synergyId } : { [partField ?? "partNumber"]: partKey! };

  const folders = useMemo(() => Array.from(new Set(rows.map(r => r.folder).filter(Boolean) as string[])).sort(), [rows]);

  async function handleUploadSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const fileIds = await uploadFiles(files);
      // create links
      const payload = fileIds.map((fid, i) => ({
        ...idKey,
        file: fid,
        order: (rows.length + i),
      }));
      await createLinks(payload);
      onRefresh();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleDelete(id: string) {
    await deleteLink(id);
    onRefresh();
  }

  async function handleSaveMeta(id: string, patch: Partial<GalleryItem> & { folder?: string | null; categories?: string[] | null; problems?: string[] | null }) {
    const send: any = {
      angle: patch.angle ?? undefined,
      grade: patch.grade ?? undefined,
      partGrade: patch.partGrade ?? undefined,
      alt: patch.alt ?? undefined,
      notes: patch.notes ?? undefined,
      problems: patch.problems ?? undefined,
      folder: patch.folder ?? undefined,
      categories: patch.categories ?? undefined,
    };
    await updateLink(id, send);
    onRefresh();
  }

  async function handleReorder(newOrder: string[]) {
    await reorderLinks(newOrder);
    onRefresh();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-neutral-900 w-full max-w-5xl rounded shadow-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-lg font-medium">Edit gallery</h2>
          <div className="ml-auto flex items-center gap-2">
            <input ref={inputRef} type="file" multiple onChange={handleUploadSelect} />
            {uploading && <span className="text-xs opacity-70">Uploading…</span>}
            <button className="px-2 py-1 border rounded" onClick={onClose}>Close</button>
          </div>
        </div>

        {/* quick folder chips */}
        {!!folders.length && (
          <div className="mb-3 flex flex-wrap gap-1">
            {folders.map(f => (
              <span key={f} className="text-xs border rounded px-2 py-0.5 opacity-80">{f}</span>
            ))}
          </div>
        )}

        {/* list + inline edit */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-auto pr-2">
          {rows.sort((a,b) => (a.order ?? 0) - (b.order ?? 0)).map((r, idx) => (
            <div key={r.id} className="border rounded p-2 flex gap-2">
              <img src={assetUrl(r.file.id)} alt={r.alt ?? ""} className="w-28 h-28 object-cover rounded" />
              <div className="flex-1 text-sm">
                <div className="flex items-center gap-2">
                  <strong className="truncate">{r.angle ?? "—"}</strong>
                  <span className="opacity-70">•</span>
                  <span className="opacity-80">G{getDisplayGrade(r) ?? "—"}</span>
                  <span className="ml-auto opacity-60">#{idx}</span>
                </div>

                {/* angle */}
                <div className="mt-2 flex gap-1">
                  {["front","back","side","label","defect_closeup"].map(a => (
                    <button key={a}
                      className={`px-2 py-0.5 border rounded text-xs ${r.angle===a ? "opacity-100" : "opacity-70"}`}
                      onClick={() => handleSaveMeta(r.id, { angle: a })}>
                      {a}
                    </button>
                  ))}
                </div>

                {/* grade/partGrade */}
                <div className="mt-2 flex gap-1">
                  {["A","B","C","D"].map(g => (
                    <button key={g}
                      className="px-2 py-0.5 border rounded text-xs"
                      onClick={() => handleSaveMeta(r.id, { grade: g as any })}>
                      Product G{g}
                    </button>
                  ))}
                  {["A","B","C","D"].map(g => (
                    <button key={`p-${g}`}
                      className="px-2 py-0.5 border rounded text-xs"
                      onClick={() => handleSaveMeta(r.id, { partGrade: g as any })}>
                      Part G{g}
                    </button>
                  ))}
                </div>

                {/* folder */}
                <div className="mt-2 flex gap-1 items-center">
                  <label className="text-xs opacity-70">Folder</label>
                  <input
                    defaultValue={r.folder ?? ""}
                    onBlur={(e) => handleSaveMeta(r.id, { folder: e.currentTarget.value || null })}
                    className="border rounded px-2 py-1 text-xs flex-1"
                    placeholder="e.g., main, defects, packaging"
                  />
                </div>

                {/* categories (comma tags) */}
                <div className="mt-2 flex gap-1 items-center">
                  <label className="text-xs opacity-70">Categories</label>
                  <input
                    defaultValue={(r.categories ?? []).join(", ")}
                    onBlur={(e) => {
                      const tags = e.currentTarget.value.split(",").map(s => s.trim()).filter(Boolean);
                      handleSaveMeta(r.id, { categories: tags.length ? tags : null });
                    }}
                    className="border rounded px-2 py-1 text-xs flex-1"
                    placeholder="e.g., laptop, charger, scratch"
                  />
                </div>

                {/* problems (comma tags) */}
                <div className="mt-2 flex gap-1 items-center">
                  <label className="text-xs opacity-70">Problems</label>
                  <input
                    defaultValue={(r.problems ?? []).join(", ")}
                    onBlur={(e) => {
                      const tags = e.currentTarget.value.split(",").map(s => s.trim()).filter(Boolean);
                      handleSaveMeta(r.id, { problems: tags.length ? tags : null });
                    }}
                    className="border rounded px-2 py-1 text-xs flex-1"
                    placeholder="e.g., crack, dead pixel"
                  />
                </div>

                <div className="mt-2 flex items-center gap-2">
                  {/* naive reorder (up/down); replace with DnD as you like */}
                  <button className="px-2 py-0.5 border rounded text-xs"
                    onClick={async () => {
                      const ordered = [...rows].sort((a,b)=> (a.order??0)-(b.order??0));
                      const i = ordered.findIndex(x=>x.id===r.id);
                      if (i <= 0) return;
                      const swap = [ordered[i-1], ordered[i]];
                      [swap[0].order, swap[1].order] = [swap[1].order, swap[0].order];
                      await reorderLinks(ordered.map(x=>x.id));
                      onRefresh();
                    }}>
                    ⬆️
                  </button>
                  <button className="px-2 py-0.5 border rounded text-xs"
                    onClick={async () => {
                      const ordered = [...rows].sort((a,b)=> (a.order??0)-(b.order??0));
                      const i = ordered.findIndex(x=>x.id===r.id);
                      if (i === ordered.length-1) return;
                      const swap = [ordered[i], ordered[i+1]];
                      [swap[0].order, swap[1].order] = [swap[1].order, swap[0].order];
                      await reorderLinks(ordered.map(x=>x.id));
                      onRefresh();
                    }}>
                    ⬇️
                  </button>

                  <button className="ml-auto px-2 py-0.5 border rounded text-xs text-red-600"
                    onClick={() => handleDelete(r.id)}>
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

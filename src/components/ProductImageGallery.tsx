import React, { useEffect, useMemo, useState } from "react";
import { assetUrl, fetchProductGalleryBySID, GalleryItem } from "@/lib/galleryClient";

type Props = {
  synergyId: string;
  testerNotes?: string | null; // optional: to pre-filter by keywords later
};

export default function ProductImageGallery({ synergyId, testerNotes }: Props) {
  const [rows, setRows] = useState<GalleryItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  const [problemTags, setProblemTags] = useState<string[]>([]);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const data = await fetchProductGalleryBySID(synergyId);
        if (dead) return;
        setRows(data);
        setActiveId(data[0]?.id ?? null);
      } catch (e) {
        console.error(e);
        setRows([]); setActiveId(null);
      }
    })();
    return () => { dead = true; };
  }, [synergyId]);

  // simple facets
  const facets = useMemo(() => {
    const grades = new Set<string>();
    const problems = new Set<string>();
    rows.forEach(r => {
      if (r.grade) grades.add(r.grade);
      (r.problems ?? []).forEach(p => problems.add(p));
    });
    return { grades: Array.from(grades).sort(), problems: Array.from(problems).sort() };
  }, [rows]);

  // filter
  const filtered = useMemo(() => {
    let list = rows;
    if (grade) list = list.filter(r => r.grade === grade);
    if (problemTags.length) {
      list = list.filter(r => {
        const names = new Set(r.problems ?? []);
        return problemTags.every(t => names.has(t));
      });
    }
    return list;
  }, [rows, grade, problemTags]);

  useEffect(() => {
    if (!filtered.length) { setActiveId(null); return; }
    if (!activeId || !filtered.some(f => f.id === activeId)) setActiveId(filtered[0].id);
  }, [filtered, activeId]);

  const active = filtered.find(f => f.id === activeId) ?? null;

  function toggleProblem(tag: string) {
    setProblemTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  async function copyLinks() {
    const urls = filtered.map(r => assetUrl(r.file.id)).join("\n");
    try { await navigator.clipboard.writeText(urls); alert(`Copied ${filtered.length} link${filtered.length===1?"":"s"}`); }
    catch {
      const ta = document.createElement("textarea");
      ta.value = urls; document.body.appendChild(ta); ta.select(); document.execCommand("copy");
      document.body.removeChild(ta); alert(`Copied ${filtered.length} link${filtered.length===1?"":"s"}`);
    }
  }

  return (
    <div className="w-full">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-sm opacity-80">Filters:</span>
        <div className="flex gap-1 flex-wrap">
          {["A","B","C","D"].filter(g => facets.grades.includes(g)).map(g => (
            <button key={g}
              onClick={() => setGrade(prev => prev===g ? null : g)}
              className={`px-2 py-1 text-xs border rounded ${grade===g ? "opacity-100" : "opacity-70"}`}
              aria-pressed={grade===g}>
              Grade {g}
            </button>
          ))}
        </div>
        {!!facets.problems.length && (
          <div className="flex gap-1 flex-wrap">
            {facets.problems.map(tag => (
              <button key={tag}
                onClick={() => toggleProblem(tag)}
                className={`px-2 py-1 text-xs border rounded ${problemTags.includes(tag) ? "opacity-100" : "opacity-70"}`}
                aria-pressed={problemTags.includes(tag)}>
                {tag}
              </button>
            ))}
          </div>
        )}
        <div className="ml-auto">
          <button onClick={copyLinks} className="px-3 py-1 text-sm border rounded">
            Copy {filtered.length} link{filtered.length===1?"":"s"}
          </button>
        </div>
      </div>

      {/* Main preview */}
      <div className="w-full mb-3">
        {active ? (
          <figure>
            <img
              src={assetUrl(active.file.id)}
              alt={active.alt ?? active.file.title ?? ""}
              className="max-h-[420px] w-auto rounded"
              draggable={false}
            />
            <figcaption className="mt-1 text-xs opacity-70">
              {active.angle ?? "—"} {active.grade ? `• G${active.grade}` : ""} {(active.problems?.length ? " • " + active.problems.join(", ") : "")}
            </figcaption>
          </figure>
        ) : (
          <div className="text-sm opacity-70 border rounded p-4">No images match the current filters.</div>
        )}
      </div>

      {/* Thumbs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
        {filtered.map(r => (
          <button key={r.id} onClick={() => setActiveId(r.id)} className={`block text-left ${activeId===r.id ? "opacity-100" : "opacity-80"}`} aria-pressed={activeId===r.id}>
            <img src={assetUrl(r.file.id)} alt={r.alt ?? r.file.title ?? ""} className="w-full h-28 object-cover rounded" loading="lazy" />
            <div className="mt-1 text-[11px] opacity-70 truncate">
              {r.angle ?? "—"} {r.grade ? `• G${r.grade}` : ""} {(r.problems?.length ? " • " + r.problems.join(", ") : "")}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

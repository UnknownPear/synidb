// src/lib/galleryEditorClient.ts
export const DIRECTUS_BASE = import.meta.env.VITE_DIRECTUS_BASE!;
function base() { return DIRECTUS_BASE.replace(/\/+$/, ""); }
function authHeaders() {
  const token =
    localStorage.getItem("synergy_auth_token") ||
    localStorage.getItem("directus_access_token") ||
    localStorage.getItem("directus_token") ||
    "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type CreateLinkInput = {
  synergyId?: string;
  partNumber?: string;
  file: string;                 // directus_files.id
  angle?: string | null;
  grade?: "A"|"B"|"C"|"D"|null;
  partGrade?: "A"|"B"|"C"|"D"|null;
  is_primary?: boolean | null;
  order?: number | null;
  alt?: string | null;
  notes?: string | null;
  problems?: string[] | null;
  folder?: string | null;
  categories?: string[] | null;
};

export async function uploadFiles(files: File[]): Promise<string[]> {
  const ids: string[] = [];
  for (const f of files) {
    const form = new FormData();
    form.append("file", f, f.name);
    const res = await fetch(`${base()}/files`, { method: "POST", headers: { ...authHeaders() }, body: form });
    if (!res.ok) throw new Error(`Upload failed: ${f.name} (${res.status})`);
    const { data } = await res.json();
    ids.push(data.id);
  }
  return ids;
}

export async function createLinks(items: CreateLinkInput[]) {
  const res = await fetch(`${base()}/items/product_image_links`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ data: items }),
  });
  if (!res.ok) throw new Error(`Create links failed: ${res.status}`);
  return (await res.json()).data;
}

export async function updateLink(id: string, patch: Partial<CreateLinkInput>) {
  const res = await fetch(`${base()}/items/product_image_links/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`Update ${id} failed: ${res.status}`);
  return (await res.json()).data;
}

export async function deleteLink(id: string) {
  const res = await fetch(`${base()}/items/product_image_links/${id}`, { method: "DELETE", headers: { ...authHeaders() } });
  if (!res.ok) throw new Error(`Delete ${id} failed: ${res.status}`);
}

export async function reorderLinks(idsInOrder: string[]) {
  const ops = idsInOrder.map((id, idx) =>
    fetch(`${base()}/items/product_image_links/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ order: idx }),
    })
  );
  const results = await Promise.all(ops);
  if (results.some((r) => !r.ok)) throw new Error("Reorder failed");
}

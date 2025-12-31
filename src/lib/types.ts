
import type { Grade } from "@/lib/grades";
import type { InventoryRow, Category as Cat } from "@/lib/dataClient";

/** Keep InventoryRow shape, add grade for UI */
export type ListRow = InventoryRow & { grade?: Grade };

export type SessionSettings = {
  defaultGrade: Grade;
  autoSetDateToToday: boolean;
  preventOverwriteExistingId: boolean;
  soundOnSave: boolean;
  denseMode: boolean;
  showSpecsInline: boolean;
  itemsPerPage: number;
  wideMode: boolean;
  autoRefreshInterval: number;
};

export const DEFAULT_SETTINGS: SessionSettings = {
  defaultGrade: "B",
  autoSetDateToToday: true,
  preventOverwriteExistingId: true,
  soundOnSave: false,
  denseMode: false,
  showSpecsInline: true,
  itemsPerPage: 50,
  wideMode: false,
  autoRefreshInterval: 30,
};

export type StatusCounts = { total: number; ready: number; incomplete: number };

export type UserType = { id: number; name: string };

export type WorkspaceFlags = {
  grade: boolean;
  testedBy: boolean;
  testedDate: boolean;
  testerComment: boolean;
  specs: boolean;
  price: boolean;
  ebayPrice: boolean;
  categoryId: boolean;
};

export type Workspace = {
  id: string;
  title: string;
  productName: string;
  criteria: { productName: string; categoryId?: string | null };
  seedRow: ListRow;
  patch: Partial<ListRow>;
  flags: WorkspaceFlags;
  selection: string[]; // synergyIds selected
  progress?: { total: number; ok: number; fail: number; running: boolean; lastError?: string };
};

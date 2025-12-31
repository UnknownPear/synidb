import { Dispatch, SetStateAction } from "react";

export type Category = {
  id: string;
  label: string;
  prefix?: string | null;
};

export type POLine = {
  id: string;
  product_name_raw: string | null;
  upc?: string | null;
  asin?: string | null;
  qty?: number | null;
  unit_cost?: number | null;
  msrp?: number | null;
  category_id?: string | null;
  synergy_id?: string | null;
  isAwaitingParts?: boolean;
  raw_json?: any;
};

export type BriefRow = {
  synergyId: string;
  status?: string;
  testedBy?: string | null;
  testedByName?: string | null;
  testedDate?: string | null;
  posted?: boolean;
  postedAt?: string | null;
  postedBy?: string | null;
  postedByName?: string | null;
  ebayPrice?: number | null;
  ebayItemUrl?: string | null;
  grade?: string | number | null;
  partStatus?: 'NEEDED' | 'ARRIVED' | null;
  ebayThumbnail?: string | null;
};

export type GroupNode = {
  type: 'group';
  key: string;
  count: number;
  totalQty: number;
  avgCost: number;
  totalMsrp: number;
  items: POLine[];
  isExpanded: boolean;
};

export type VirtualItemData = POLine | GroupNode;
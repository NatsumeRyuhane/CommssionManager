export type Rating = "general" | "mature" | "adult";
export type LabelType = "category" | "tag" | "rating";

export interface Cover {
  file_id: number;
  url: string;
  width: number | null;
  height: number | null;
  focal_x: number | null;
  focal_y: number | null;
}

export interface CommissionListItem {
  id: number;
  title: string;
  rating: Rating;
  completed_at: string | null;
  categories: string[];
  tags: string[];
  characters: string[];
  artists: string[];
  formats: string[];
  current_stage: string | null;
  cover: Cover | null;
}

export interface CommissionFile {
  id: number;
  node_id: number;
  format: string;
  label: string | null;
  is_image: boolean;
  width: number | null;
  height: number | null;
  focal_x: number | null;
  focal_y: number | null;
  url: string;
  is_cover: boolean;
}

export interface CommissionNode {
  id: number;
  name: string;
  position: number | null;
  started_at: string | null;
  is_detached: boolean;
  files: CommissionFile[];
}

export interface CommissionDetail extends CommissionListItem {
  description: string | null;
  confirmed_at: string | null;
  price_amount: string | null;
  price_currency: string | null;
  nodes: CommissionNode[];
  created_at: string;
  updated_at: string;
}

export interface CommissionCreate {
  title: string;
  description?: string | null;
  completed_at?: string | null;
  rating?: Rating;
  category_names?: string[];
  tag_names?: string[];
  character_names?: string[];
  artist_names?: string[];
  node_names?: string[];
}

export type CommissionUpdate = Partial<CommissionCreate> & { cover_file_id?: number | null };

export interface MeResponse {
  authenticated: boolean;
  kind: string | null;
  label?: string;
  can_write: boolean;
  scopes?: string[];
}

export interface ListParams {
  q?: string;
  categories?: string[];
  tags?: string[];
  rating?: string[];
  characters?: string[];
  artists?: string[];
  formats?: string[];
  sort?: "date" | "title";
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface Paged<T> {
  items: T[];
  total: number;
}

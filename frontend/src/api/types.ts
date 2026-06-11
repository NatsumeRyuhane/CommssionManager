export type Rating = "general" | "mature" | "adult";
export type LabelType = "category" | "tag" | "rating";
export type Visibility = "public" | "private";
export type VisibilityPreset = "public_by_default" | "private_by_default" | "custom";
export type VisibilityFieldKey =
  | "title"
  | "description"
  | "labels"
  | "rating"
  | "characters"
  | "artists"
  | "completed_at"
  | "confirmed_at"
  | "price";

export type ImagePreset = "thumb" | "small" | "medium" | "large";

/** Preset name -> server-side derivative URL (/files/{id}/image?size=...). */
export type ImageUrls = Partial<Record<ImagePreset, string>>;

export interface Cover {
  file_id: number;
  url: string;
  image_urls: ImageUrls | null;
  width: number | null;
  height: number | null;
  focal_x: number | null;
  focal_y: number | null;
  focal_zoom: number | null;
}

export interface CommissionListItem {
  id: number;
  title: string;
  rating: Rating | null;
  completed_at: string | null;
  visibility: Visibility | null;
  effective_visibility: Visibility | null;
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
  position: number;
  format: string;
  label: string | null;
  is_image: boolean;
  width: number | null;
  height: number | null;
  focal_x: number | null;
  focal_y: number | null;
  focal_zoom: number | null;
  visibility: Visibility | null;
  effective_visibility: Visibility | null;
  url: string;
  image_urls: ImageUrls | null;
  is_cover: boolean;
}

export interface CommissionNode {
  id: number;
  name: string;
  position: number | null;
  started_at: string | null;
  is_detached: boolean;
  visibility: Visibility | null;
  effective_visibility: Visibility | null;
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
  confirmed_at?: string | null;
  price_amount?: string | null;
  price_currency?: string | null;
  visibility_override?: Visibility | null;
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

export interface ApiKey {
  id: number;
  name: string;
  prefix: string;
  scopes: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface ApiKeyCreated extends ApiKey {
  full_key: string;
}

export interface ApiKeyCreate {
  name: string;
  scopes: string[];
}

export interface AliasOut {
  id: number;
  alias: string;
}

export interface Label {
  id: number;
  name: string;
  type: LabelType;
  aliases: AliasOut[];
}

export interface Character {
  id: number;
  name: string;
  aliases: AliasOut[];
  has_page: boolean;
}

export interface Artist {
  id: number;
  name: string;
  info_xml: string | null;
  aliases: AliasOut[];
}

export interface ArtistCreate {
  name: string;
  info_xml?: string | null;
}

export interface ArtistUpdate {
  name?: string | null;
  info_xml?: string | null;
}

export type VisibilityFields = Record<VisibilityFieldKey, boolean>;
export type VisibilityFieldPatch = Partial<Record<VisibilityFieldKey, boolean | null>>;

export interface VisibilityStageDefault {
  id?: number;
  stage_name: string;
  visibility: Visibility;
  position: number;
  note?: string | null;
}

export interface VisibilitySettings {
  preset: VisibilityPreset;
  default_commission_visibility: Visibility;
  default_stage_visibility: Visibility;
  fields: VisibilityFields;
  stage_defaults: VisibilityStageDefault[];
  updated_at: string | null;
}

export interface VisibilitySettingsUpdate {
  preset?: VisibilityPreset | null;
  default_commission_visibility?: Visibility | null;
  default_stage_visibility?: Visibility | null;
  fields?: VisibilityFieldPatch | null;
  stage_defaults?: VisibilityStageDefault[] | null;
}

export interface StorageSettings {
  backend: string;
  local_root: string | null;
  configurable_via: string;
}

export interface SiteSettings {
  site_title: string;
  updated_at: string | null;
}

export interface SiteSettingsUpdate {
  site_title?: string | null;
}

export interface CommissionVisibilityField {
  field: VisibilityFieldKey;
  public: boolean | null;
  effective_public: boolean;
}

export interface FileVisibilityState {
  id: number;
  label: string | null;
  format: string;
  is_image: boolean;
  visibility: Visibility | null;
  effective_visibility: Visibility;
}

export interface NodeVisibilityState {
  id: number;
  name: string;
  is_detached: boolean;
  visibility: Visibility | null;
  effective_visibility: Visibility;
  files: FileVisibilityState[];
}

export interface CommissionVisibility {
  commission_id: number;
  visibility: Visibility | null;
  effective_visibility: Visibility;
  fields: CommissionVisibilityField[];
  nodes: NodeVisibilityState[];
}

export interface CommissionVisibilityUpdate {
  visibility?: Visibility | null;
  fields?: VisibilityFieldPatch | null;
  nodes?: Record<number, Visibility | null>;
  files?: Record<number, Visibility | null>;
}

export interface CharacterPageCommission {
  commission_id: number;
  title: string;
  cover: Cover | null;
  completed_at: string | null;
}

export interface CharacterPageSetItem {
  id: number;
  position: number;
  commission: CharacterPageCommission;
}

export interface CharacterPageSet {
  id: number;
  title: string;
  description: string | null;
  position: number;
  items: CharacterPageSetItem[];
}

export interface CharacterPage {
  character_id: number;
  character_name: string;
  about: string | null;
  main_reference: CharacterPageCommission | null;
  sets: CharacterPageSet[];
  commission_count: number;
  updated_at: string | null;
}

export interface CharacterPageUpdate {
  about?: string | null;
  main_reference_commission_id?: number | null;
}

export interface CharacterPageSetCreate {
  title: string;
  description?: string | null;
}

export interface CharacterPageSetUpdate {
  title?: string | null;
  description?: string | null;
}

export interface CharacterPageDirectoryItem {
  character_id: number;
  character_name: string;
  set_count: number;
  commission_count_total: number;
  commission_count_in_db: number;
  main_reference: CharacterPageCommission | null;
  updated_at: string | null;
}

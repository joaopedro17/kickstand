export interface KickCategory {
  id: number;
  name: string;
  thumbnail: string;
}

export interface KickCategoryWithTags extends KickCategory {
  tags: string[];
}

export interface KickStreamInfo {
  is_live: boolean;
  viewer_count: number;
  thumbnail: string;
  url: string;
  language?: string;
}

export interface KickChannel {
  broadcaster_user_id: number;
  slug: string;
  stream_title: string;
  category: KickCategory | null;
  stream: KickStreamInfo | null;
}

export interface KickLivestream {
  id: string;
  broadcaster_user: { id: number; username: string; profile_picture: string };
  channel: { slug: string };
  title: string;
  category: KickCategory | null;
  thumbnail: string;
  started_at: string;
  viewer_count: number;
  has_mature_content: boolean;
  language_code: string;
  tags: string[];
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: { next_cursor: string | null };
}

export interface KickUser {
  user_id: number;
  name: string;
  email: string;
  profile_picture: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
  scope: string;
}

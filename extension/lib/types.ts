/**
 * Kick data as Kickstand uses it, after lib/kick-parse.ts has checked it.
 * Only the fields something reads are kept; the rest of Kick's responses
 * (including the current user's email address) is dropped at the boundary.
 */

export interface Livestream {
  id: string;
  broadcaster: { id: number; username: string; profilePicture: string | null };
  slug: string;
  title: string;
  category: { id: number; name: string } | null;
  thumbnail: string | null;
  /** Kick's `started_at`, kept as the opaque string it sent. */
  startedAt: string | null;
  viewerCount: number;
  hasMatureContent: boolean;
  languageCode: string;
}

export interface Category {
  id: number;
  name: string;
  thumbnail: string | null;
  tags: string[];
}

export interface Channel {
  broadcasterUserId: number;
  slug: string;
}

export interface CurrentUser {
  userId: number;
  profilePicture: string | null;
}

export interface TokenGrant {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  refreshExpiresInSeconds: number;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

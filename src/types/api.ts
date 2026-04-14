/**
 * Replace / extend these to match your API’s JSON. Example-only shapes.
 */

export type ApiErrorBody = {
  message?: string;
  error?: string;
  errors?: Record<string, string[]>;
};

/** Typical login success — adjust field names to your JSON. */
export type LoginResponseJson = {
  accessToken?: string;
  token?: string;
  refreshToken?: string;
  user: UserJson;
};

export type UserJson = {
  id: string;
  email?: string;
  fullName?: string;
  role?: string;
};

export type MeResponseJson = {
  user: UserJson;
};

import type { ErrorCode } from "../errors.js";

// Format de réponse unique du contrat §4.1 : { data, error }.
export interface ApiErrorBody {
  code: ErrorCode;
  message: string;
}

export interface ApiResponse<T> {
  data: T | null;
  error: ApiErrorBody | null;
}

export const ok = <T>(data: T): ApiResponse<T> => ({ data, error: null });

export const fail = (code: ErrorCode, message: string): ApiResponse<never> => ({
  data: null,
  error: { code, message },
});

export interface ApiError {
  error: string;
  details?: unknown;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
}

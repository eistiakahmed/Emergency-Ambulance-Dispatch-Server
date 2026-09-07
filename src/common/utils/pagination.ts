import { DEFAULT_PAGINATION } from '../../config/constants.js';

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function parsePaginationParams(query: any): {
  page: number;
  limit: number;
  skip: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
} {
  const page = Math.max(1, parseInt(query.page as string, 10) || DEFAULT_PAGINATION.PAGE);
  const limit = Math.min(
    DEFAULT_PAGINATION.MAX_LIMIT,
    Math.max(1, parseInt(query.limit as string, 10) || DEFAULT_PAGINATION.LIMIT)
  );
  const skip = (page - 1) * limit;
  const sortBy = (query.sortBy as string) || 'createdAt';
  const sortOrder = (query.sortOrder === 'asc' ? 'asc' : 'desc') as 'asc' | 'desc';

  return {
    page,
    limit,
    skip,
    sortBy,
    sortOrder,
  };
}

export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number
): PaginatedResult<T> {
  return {
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems?: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  pageSizeOptions?: number[];
  onPageSizeChange?: (pageSize: number) => void;
  itemName?: string;
  className?: string;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  pageSizeOptions,
  onPageSizeChange,
  itemName = 'bản ghi',
  className = '',
}) => {
  // Nếu không có trang nào hoặc chỉ có 0 bản ghi
  if (totalPages <= 0) return null;

  // Tính khoảng hiển thị
  const startItem = totalItems !== undefined && pageSize !== undefined
    ? Math.min((currentPage - 1) * pageSize + 1, totalItems)
    : undefined;
  const endItem = totalItems !== undefined && pageSize !== undefined
    ? Math.min(currentPage * pageSize, totalItems)
    : undefined;

  // Sinh danh sách số trang có ellipsis (...)
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible + 2) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
      return pages;
    }

    pages.push(1);

    const left = Math.max(2, currentPage - 1);
    const right = Math.min(totalPages - 1, currentPage + 1);

    if (left > 2) {
      pages.push('...');
    }

    for (let i = left; i <= right; i++) {
      pages.push(i);
    }

    if (right < totalPages - 1) {
      pages.push('...');
    }

    pages.push(totalPages);
    return pages;
  };

  const pages = getPageNumbers();

  return (
    <div className={`pagination-wrapper ${className}`}>
      {/* Thông tin số lượng */}
      <div className="pagination-info">
        {totalItems !== undefined && startItem !== undefined && endItem !== undefined ? (
          <span>
            Hiển thị <strong>{totalItems === 0 ? 0 : startItem}</strong> - <strong>{endItem}</strong> trên <strong>{totalItems}</strong> {itemName}
          </span>
        ) : (
          <span>
            Trang <strong>{currentPage}</strong> / <strong>{totalPages}</strong>
          </span>
        )}
      </div>

      {/* Điều hướng trang */}
      <div className="pagination-controls">
        {/* Nút về đầu */}
        <button
          type="button"
          className="btn-page-nav"
          onClick={() => onPageChange(1)}
          disabled={currentPage <= 1}
          title="Trang đầu tiên"
          aria-label="Trang đầu"
        >
          <ChevronsLeft size={16} />
        </button>

        {/* Nút lùi 1 trang */}
        <button
          type="button"
          className="btn-page-nav"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          title="Trang trước"
          aria-label="Trang trước"
        >
          <ChevronLeft size={16} />
          <span className="btn-page-nav-text">Trước</span>
        </button>

        {/* Danh sách các số trang */}
        <div className="pagination-numbers">
          {pages.map((p, idx) => {
            if (p === '...') {
              return (
                <span key={`ellipsis-${idx}`} className="pagination-ellipsis">
                  &hellip;
                </span>
              );
            }
            const pageNum = Number(p);
            const isActive = pageNum === currentPage;
            return (
              <button
                key={`page-${pageNum}`}
                type="button"
                className={`btn-page-number ${isActive ? 'active' : ''}`}
                onClick={() => onPageChange(pageNum)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={`Trang ${pageNum}`}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        {/* Nút tiến 1 trang */}
        <button
          type="button"
          className="btn-page-nav"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          title="Trang tiếp theo"
          aria-label="Trang sau"
        >
          <span className="btn-page-nav-text">Sau</span>
          <ChevronRight size={16} />
        </button>

        {/* Nút tới cuối */}
        <button
          type="button"
          className="btn-page-nav"
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage >= totalPages}
          title="Trang cuối cùng"
          aria-label="Trang cuối"
        >
          <ChevronsRight size={16} />
        </button>
      </div>

      {/* Tùy chọn số mục trên mỗi trang (nếu có) */}
      {pageSizeOptions && onPageSizeChange && pageSize && (
        <div className="pagination-size-selector">
          <label htmlFor="page-size-select" className="pagination-size-label">
            Số mục:
          </label>
          <select
            id="page-size-select"
            className="pagination-select"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt} / trang
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
};

/**
 * Tiện ích hỗ trợ phân trang danh sách dữ liệu trên client-side
 */
export function paginateArray<T>(items: T[], page: number, pageSize: number): {
  pagedItems: T[];
  totalPages: number;
  totalItems: number;
  map<U>(callback: (item: T, index: number, array: T[]) => U): U[];
  [Symbol.iterator](): IterableIterator<T>;
  length: number;
} {
  const totalItems = items.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const validPage = Math.min(Math.max(1, page), totalPages);
  const start = (validPage - 1) * pageSize;
  const pagedItems = items.slice(start, start + pageSize);

  return {
    pagedItems,
    totalPages,
    totalItems,
    map: (callback) => pagedItems.map(callback),
    [Symbol.iterator]: () => pagedItems[Symbol.iterator](),
    get length() {
      return pagedItems.length;
    },
  };
}

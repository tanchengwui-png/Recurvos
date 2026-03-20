type TablePaginationProps = {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  pageSizeOptions?: number[];
};

export function TablePagination({
  currentPage,
  pageSize,
  totalItems,
  totalPages,
  rangeStart,
  rangeEnd,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [20, 50, 100],
}: TablePaginationProps) {
  if (totalItems <= 0) {
    return null;
  }

  return (
    <div className="table-pagination">
      <p className="muted table-pagination-summary">{`Showing ${rangeStart}-${rangeEnd} of ${totalItems}`}</p>
      <div className="table-pagination-controls">
        <label className="table-pagination-size">
          <span className="muted">Rows</span>
          <select
            value={pageSize}
            onChange={(event) => {
              const nextSize = Number(event.target.value) || 20;
              onPageSizeChange(nextSize);
              onPageChange(1);
            }}
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
        <div className="table-pagination-buttons">
          <button type="button" className="button button-secondary button-compact" disabled={currentPage <= 1} onClick={() => onPageChange(currentPage - 1)}>
            Prev
          </button>
          <span className="muted table-pagination-page">{`Page ${currentPage} / ${totalPages}`}</span>
          <button type="button" className="button button-secondary button-compact" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

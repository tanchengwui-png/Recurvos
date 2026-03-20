import { useEffect, useMemo, useState } from "react";

export function useClientPagination<T>(items: T[], dependencies: readonly unknown[], initialPageSize = 20) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [...dependencies]);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => {
    setCurrentPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, currentPage, pageSize]);

  const rangeStart = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = totalItems === 0 ? 0 : Math.min(totalItems, currentPage * pageSize);

  return {
    currentPage,
    pageSize,
    totalItems,
    totalPages,
    pagedItems,
    rangeStart,
    rangeEnd,
    setCurrentPage,
    setPageSize,
  };
}

import type { ReactNode } from "react";
import { Skeleton } from "./Skeleton";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
  /** hide below md */
  hideOnMobile?: boolean;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  empty?: ReactNode;
  caption: string;
  /** makes rows selectable by click, Enter or Space */
  onRowClick?: (row: T) => void;
  isSelected?: (row: T) => boolean;
}

export function Table<T>({ columns, rows, rowKey, loading, empty, caption, onRowClick, isSelected }: Props<T>) {
  if (!loading && rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className="overflow-x-auto rounded-[14px] border border-line bg-white shadow-card">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line bg-[#F8F9FD]">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted ${c.className ?? ""}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  {columns.map((c) => (
                    <td key={c.key} className="px-4 py-3">
                      <Skeleton className="h-4 w-full max-w-[160px]" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((r) => (
                <tr
                  key={rowKey(r)}
                  className={`border-b border-line align-middle last:border-0 hover:bg-[#FAFBFE] ${onRowClick ? "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue" : ""} ${isSelected?.(r) ? "bg-blue-soft" : ""}`}
                  aria-current={isSelected?.(r) ? "true" : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (ev) => {
                          if (ev.key === "Enter" || ev.key === " ") {
                            ev.preventDefault();
                            onRowClick(r);
                          }
                        }
                      : undefined
                  }
                >
                  {columns.map((c) => (
                    <td key={c.key} className={`px-4 py-3 ${c.className ?? ""}`}>
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}

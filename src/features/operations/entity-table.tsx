"use client";
import { useMemo } from "react";
import Link from "next/link";
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { ApiRow } from "@/lib/api";
import { dateLabel, money } from "@/lib/utils";
import { useWorkspace } from "@/lib/workspace";
import { labels, rowName, rowValue, type ColumnSpec } from "./definitions";

export function StatusBadge({ value }: { value: unknown }) {
  const status = String(value ?? "—");
  const tint = ["ACTIVE", "PAID", "CONFIRMED", "APPROVED", "PUBLISHED"].includes(status) ? " badge-good"
    : ["CANCELED", "OVERDUE", "REJECTED", "REVOKED", "REVERSED", "FAILED"].includes(status) ? " badge-danger"
    : ["PARTIAL", "SCHEDULED", "SUBMITTED", "PENDING"].includes(status) ? " badge-warning" : "";
  return <span className={"badge" + tint}>{labels[status] ?? status}</span>;
}

export function EntityTable({ rows, columns, detailRoute, actions, sort, sortBy }: {
  rows: ApiRow[]; columns: ColumnSpec[]; detailRoute?: string; actions?: (row: ApiRow) => React.ReactNode;
  sort?: string; sortBy?: (id: string) => void;
}) {
  const { company } = useWorkspace();
  const tableColumns = useMemo<ColumnDef<ApiRow>[]>(() => {
    const fields: ColumnDef<ApiRow>[] = columns.map(column => ({
      id: column.key,
      header: column.label,
      accessorFn: row => rowValue(row, column.key, column.aliases),
      cell: ({ getValue, row }) => {
        const value = getValue();
        switch (column.type) {
          case "money": return money(value, String(row.original.currency ?? company.currency));
          case "date": return dateLabel(value, company.timezone);
          case "status": return <StatusBadge value={value} />;
          case "link": return <Link href={detailRoute + "/" + row.original.id}>{String(value ?? rowName(row.original))}</Link>;
          case "kind": return labels[String(value)] ?? String(value ?? "—");
          default: return String(value ?? "—");
        }
      },
    }));
    if (actions) fields.push({ id: "actions", header: "Ações", cell: ({ row }) => actions(row.original) });
    return fields;
  }, [columns, actions, company, detailRoute]);
  // The table instance is used locally. React Compiler must not memoize its getters.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({ data: rows, columns: tableColumns, getCoreRowModel: getCoreRowModel(), getRowId: row => row.id });
  const [sortField, direction] = (sort ?? "").split(",");
  return <div className="table-overflow">
    <table className="entity-table responsive">
      <thead>{table.getHeaderGroups().map(group => <tr key={group.id}>{group.headers.map(header => {
        const sorted = header.column.id === sortField;
        const label = flexRender(header.column.columnDef.header, header.getContext());
        const Icon = !sorted ? ArrowUpDown : direction === "desc" ? ArrowDown : ArrowUp;
        return <th key={header.id} scope="col" aria-sort={sorted ? direction === "desc" ? "descending" : "ascending" : undefined}>
          {sortBy && ["name", "description", "saleNumber", "createdAt", "updatedAt", "effectiveDate", "dueDate", "periodStart"].includes(header.column.id) ? <button type="button" className="sort-button" onClick={() => sortBy(header.column.id)}>{label} <Icon size={12} /></button> : label}
        </th>;
      })}</tr>)}</thead>
      <tbody>{table.getRowModel().rows.map(row => <tr key={row.id}>{row.getVisibleCells().map(cell =>
        <td key={cell.id} data-label={String(cell.column.columnDef.header ?? "")}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>,
      )}</tr>)}</tbody>
    </table>
  </div>;
}

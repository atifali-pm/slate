import { bookingStatusEnum, type BookingStatus } from "@/db/schema";

const VALID_STATUSES = new Set<string>(bookingStatusEnum.enumValues);

export type ParsedFilters = {
  from: Date | undefined;
  to: Date | undefined;
  status: BookingStatus[];
  staffUserId: string | undefined;
  query: string;
  page: number;
};

export const PAGE_SIZE = 25;

function parseDate(input: string | undefined, endOfDay: boolean): Date | undefined {
  if (!input) return undefined;
  const ts = Date.parse(input);
  if (Number.isNaN(ts)) return undefined;
  // input may be just a date (YYYY-MM-DD); add the right time-of-day
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const d = new Date(input + (endOfDay ? "T23:59:59" : "T00:00:00"));
    return d;
  }
  return new Date(ts);
}

export function parseFiltersFromParams(
  params: Record<string, string | string[] | undefined>,
): ParsedFilters {
  const from = parseDate(asString(params.from), false);
  const to = parseDate(asString(params.to), true);
  const rawStatus = asArray(params.status).filter((s) => VALID_STATUSES.has(s));
  const staffParam = asString(params.staff);
  const query = asString(params.q) ?? "";
  const pageParam = asString(params.page);
  const page = pageParam && /^\d+$/.test(pageParam) ? Math.max(1, parseInt(pageParam, 10)) : 1;
  return {
    from,
    to,
    status: rawStatus as BookingStatus[],
    staffUserId: staffParam || undefined,
    query,
    page,
  };
}

function asString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

function asArray(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") return v.split(",").filter(Boolean);
  return [];
}

export function buildSearchString(filters: Partial<ParsedFilters>): string {
  const sp = new URLSearchParams();
  if (filters.from) sp.set("from", toDateOnly(filters.from));
  if (filters.to) sp.set("to", toDateOnly(filters.to));
  if (filters.status && filters.status.length > 0)
    sp.set("status", filters.status.join(","));
  if (filters.staffUserId) sp.set("staff", filters.staffUserId);
  if (filters.query && filters.query.length > 0) sp.set("q", filters.query);
  if (filters.page && filters.page > 1) sp.set("page", String(filters.page));
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function toDateOnly(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

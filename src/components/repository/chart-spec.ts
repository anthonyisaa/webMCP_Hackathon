export const CHART_SOURCE_MAX_CODE_POINTS = 20_000;

export type RepositoryChartType = "bar" | "line";

export interface RepositoryChartSeries {
  name: string;
  values: number[];
}

export interface RepositoryChartSpec {
  version: 1;
  type: RepositoryChartType;
  title: string;
  description: string;
  labels: string[];
  series: RepositoryChartSeries[];
  xLabel?: string;
  yLabel?: string;
}

export type RepositoryChartParseResult =
  | { ok: true; value: RepositoryChartSpec }
  | { ok: false; error: string };

const ROOT_KEYS = new Set([
  "version",
  "type",
  "title",
  "description",
  "labels",
  "series",
  "xLabel",
  "yLabel",
]);
const SERIES_KEYS = new Set(["name", "values"]);

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedText(
  value: unknown,
  label: string,
  maximum: number,
): string | RepositoryChartParseResult {
  if (typeof value !== "string" || !value.trim()) {
    return { ok: false, error: `${label} must be nonblank text.` };
  }
  if (codePointLength(value) > maximum) {
    return { ok: false, error: `${label} is longer than ${maximum} characters.` };
  }
  return value;
}

function firstUnknownKey(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): string | undefined {
  return Object.keys(record).find((key) => !allowed.has(key));
}

/** Validate the intentionally small, inert chart grammar used by repository documents. */
export function parseRepositoryChart(source: string): RepositoryChartParseResult {
  if (codePointLength(source) > CHART_SOURCE_MAX_CODE_POINTS) {
    return { ok: false, error: "Chart source is longer than 20,000 characters." };
  }

  let input: unknown;
  try {
    input = JSON.parse(source);
  } catch {
    return { ok: false, error: "Chart JSON could not be parsed." };
  }
  if (!isRecord(input)) {
    return { ok: false, error: "A chart fence must contain one JSON object." };
  }
  const unknownRootKey = firstUnknownKey(input, ROOT_KEYS);
  if (unknownRootKey) {
    return { ok: false, error: `Unknown chart property: ${unknownRootKey}.` };
  }
  if (input.version !== 1) {
    return { ok: false, error: "Chart version must be 1." };
  }
  if (input.type !== "bar" && input.type !== "line") {
    return { ok: false, error: "Chart type must be bar or line." };
  }

  const title = boundedText(input.title, "Chart title", 120);
  if (typeof title !== "string") return title;
  const description = boundedText(input.description, "Chart description", 500);
  if (typeof description !== "string") return description;

  if (!Array.isArray(input.labels) || input.labels.length < 1 || input.labels.length > 12) {
    return { ok: false, error: "Charts require between 1 and 12 labels." };
  }
  if (input.type === "line" && input.labels.length < 2) {
    return { ok: false, error: "Line charts require at least two labels." };
  }
  const labels: string[] = [];
  for (const [index, value] of input.labels.entries()) {
    const label = boundedText(value, `Label ${index + 1}`, 80);
    if (typeof label !== "string") return label;
    labels.push(label);
  }

  if (!Array.isArray(input.series) || input.series.length < 1 || input.series.length > 4) {
    return { ok: false, error: "Charts require between 1 and 4 series." };
  }
  const series: RepositoryChartSeries[] = [];
  const names = new Set<string>();
  for (const [index, candidate] of input.series.entries()) {
    if (!isRecord(candidate)) {
      return { ok: false, error: `Series ${index + 1} must be an object.` };
    }
    const unknownSeriesKey = firstUnknownKey(candidate, SERIES_KEYS);
    if (unknownSeriesKey) {
      return { ok: false, error: `Unknown series property: ${unknownSeriesKey}.` };
    }
    const name = boundedText(candidate.name, `Series ${index + 1} name`, 80);
    if (typeof name !== "string") return name;
    if (names.has(name)) {
      return { ok: false, error: `Series names must be unique: ${name}.` };
    }
    names.add(name);
    if (!Array.isArray(candidate.values) || candidate.values.length !== labels.length) {
      return {
        ok: false,
        error: `Series ${name} must contain exactly ${labels.length} values.`,
      };
    }
    const values: number[] = [];
    for (const value of candidate.values) {
      if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1e12) {
        return { ok: false, error: `Series ${name} contains an invalid numeric value.` };
      }
      values.push(value);
    }
    series.push({ name, values });
  }

  let xLabel: string | undefined;
  if (input.xLabel !== undefined) {
    const parsed = boundedText(input.xLabel, "Horizontal axis label", 80);
    if (typeof parsed !== "string") return parsed;
    xLabel = parsed;
  }
  let yLabel: string | undefined;
  if (input.yLabel !== undefined) {
    const parsed = boundedText(input.yLabel, "Vertical axis label", 80);
    if (typeof parsed !== "string") return parsed;
    yLabel = parsed;
  }

  return {
    ok: true,
    value: {
      version: 1,
      type: input.type,
      title,
      description,
      labels,
      series,
      ...(xLabel ? { xLabel } : {}),
      ...(yLabel ? { yLabel } : {}),
    },
  };
}

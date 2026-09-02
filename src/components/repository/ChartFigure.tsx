import { useId } from "react";

import type { RepositoryChartSpec } from "./chart-spec";
import styles from "./repository-workspace.module.css";

const PALETTE = ["#29685b", "#7c62ac", "#d28745", "#4f75a8"] as const;
const WIDTH = 720;
const HEIGHT = 320;
const PLOT = { left: 58, right: 20, top: 24, bottom: 64 } as const;
const COMPACT_NUMBER_FORMATTER = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function compactNumber(value: number): string {
  return COMPACT_NUMBER_FORMATTER.format(value);
}

export interface ChartFigureProps {
  chart: RepositoryChartSpec;
  onSelectSource?: (element: HTMLElement) => void;
}

/** A deterministic, fixed-palette SVG with a real HTML data-table fallback. */
export function ChartFigure({ chart, onSelectSource }: ChartFigureProps) {
  const titleId = useId();
  const descriptionId = useId();
  const values = chart.series.flatMap((entry) => entry.values);
  const minimum = Math.min(0, ...values);
  const maximum = Math.max(0, ...values);
  const span = maximum - minimum || 1;
  const plotWidth = WIDTH - PLOT.left - PLOT.right;
  const plotHeight = HEIGHT - PLOT.top - PLOT.bottom;
  const yFor = (value: number) => PLOT.top + ((maximum - value) / span) * plotHeight;
  const zeroY = yFor(0);
  const groupWidth = plotWidth / chart.labels.length;
  const barGap = 4;
  const barWidth = Math.max(4, (groupWidth * 0.72 - barGap * (chart.series.length - 1)) / chart.series.length);

  return (
    <figure className={styles.chartFigure} data-selection-disabled="true">
      <figcaption>
        <span>
          <strong>{chart.title}</strong>
          <small>{chart.description}</small>
        </span>
        {onSelectSource ? (
          <button
            type="button"
            onClick={(event) => onSelectSource(event.currentTarget.closest("figure") as HTMLElement)}
          >
            Comment on chart
          </button>
        ) : null}
      </figcaption>
      <div className={styles.chartCanvas}>
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-labelledby={`${titleId} ${descriptionId}`}
          preserveAspectRatio="xMidYMid meet"
        >
          <title id={titleId}>{chart.title}</title>
          <desc id={descriptionId}>{chart.description}</desc>
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const value = maximum - span * ratio;
            const y = PLOT.top + plotHeight * ratio;
            return (
              <g key={ratio}>
                <line x1={PLOT.left} x2={WIDTH - PLOT.right} y1={y} y2={y} className={styles.chartGrid} />
                <text x={PLOT.left - 9} y={y + 4} textAnchor="end" className={styles.chartTick}>
                  {compactNumber(value)}
                </text>
              </g>
            );
          })}
          <line x1={PLOT.left} x2={WIDTH - PLOT.right} y1={zeroY} y2={zeroY} className={styles.chartAxis} />
          {chart.type === "bar" ? chart.labels.flatMap((label, labelIndex) =>
            chart.series.map((entry, seriesIndex) => {
              const value = entry.values[labelIndex] ?? 0;
              const x = PLOT.left + labelIndex * groupWidth + groupWidth * 0.14 + seriesIndex * (barWidth + barGap);
              const valueY = yFor(value);
              return (
                <rect
                  key={`${label}:${entry.name}`}
                  x={x}
                  y={Math.min(valueY, zeroY)}
                  width={barWidth}
                  height={Math.max(1, Math.abs(zeroY - valueY))}
                  rx="4"
                  fill={PALETTE[seriesIndex]}
                >
                  <title>{`${label} · ${entry.name}: ${value}`}</title>
                </rect>
              );
            }),
          ) : chart.series.map((entry, seriesIndex) => {
            const points = entry.values.map((value, labelIndex) => {
              const x = PLOT.left + groupWidth * (labelIndex + 0.5);
              return `${x},${yFor(value)}`;
            }).join(" ");
            return (
              <g key={entry.name}>
                <polyline points={points} fill="none" stroke={PALETTE[seriesIndex]} strokeWidth="3" strokeLinejoin="round" />
                {entry.values.map((value, labelIndex) => (
                  <circle
                    key={`${entry.name}:${labelIndex}`}
                    cx={PLOT.left + groupWidth * (labelIndex + 0.5)}
                    cy={yFor(value)}
                    r="4"
                    fill={PALETTE[seriesIndex]}
                  >
                    <title>{`${chart.labels[labelIndex]} · ${entry.name}: ${value}`}</title>
                  </circle>
                ))}
              </g>
            );
          })}
          {chart.labels.map((label, index) => (
            <text
              key={label}
              x={PLOT.left + groupWidth * (index + 0.5)}
              y={HEIGHT - 38}
              textAnchor="middle"
              className={styles.chartLabel}
            >
              {label.length > 18 ? `${label.slice(0, 17)}…` : label}
            </text>
          ))}
          {chart.yLabel ? (
            <text x="14" y={HEIGHT / 2} textAnchor="middle" transform={`rotate(-90 14 ${HEIGHT / 2})`} className={styles.chartAxisLabel}>
              {chart.yLabel}
            </text>
          ) : null}
          {chart.xLabel ? (
            <text x={PLOT.left + plotWidth / 2} y={HEIGHT - 7} textAnchor="middle" className={styles.chartAxisLabel}>
              {chart.xLabel}
            </text>
          ) : null}
        </svg>
      </div>
      <div className={styles.chartLegend} aria-label="Chart legend">
        {chart.series.map((entry, index) => (
          <span key={entry.name}><i style={{ background: PALETTE[index] }} />{entry.name}</span>
        ))}
      </div>
      <details className={styles.chartData}>
        <summary>View chart data</summary>
        <div className={styles.tableScroll}>
          <table>
            <caption>{chart.title}</caption>
            <thead><tr><th scope="col">{chart.xLabel ?? "Label"}</th>{chart.series.map((entry) => <th scope="col" key={entry.name}>{entry.name}</th>)}</tr></thead>
            <tbody>
              {chart.labels.map((label, labelIndex) => (
                <tr key={label}><th scope="row">{label}</th>{chart.series.map((entry) => <td key={entry.name}>{entry.values[labelIndex]}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

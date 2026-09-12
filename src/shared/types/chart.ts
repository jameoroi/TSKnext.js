/**
 * One plotted value.
 *
 * Declared here rather than inside AdminChart.vue because `<script setup>` is
 * compiled as a module body that cannot carry exports — a lesson already paid
 * for once when a type exported from an SFC broke the build.
 */
export type ChartPoint = {
  label: string;
  value: number;
  caption?: string;
};

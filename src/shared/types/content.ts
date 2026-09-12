/**
 * One section of a written page (terms, privacy, returns, news, videos).
 *
 * This lives here rather than inside StaticContentPage.vue because `<script
 * setup>` is compiled as a module body with no exports — declaring the type
 * there and importing it from the pages risks failing the build.
 */
export type ContentSection = {
  heading: string;
  /** A single paragraph, or several. */
  body: string | string[];
  /** Optional bullet list rendered after the body paragraphs. */
  points?: string[];
};

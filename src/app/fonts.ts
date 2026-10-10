import localFont from "next/font/local";

// Self-hosted from pinned @fontsource packages (SIL Open Font License): no third-party font
// requests, which keeps the CSP at font-src 'self' and works in builds without internet access.

export const archivo = localFont({
  src: "../../node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2",
  variable: "--font-archivo",
  weight: "100 900",
  display: "swap",
  declarations: [{ prop: "font-stretch", value: "62% 125%" }],
});

export const atkinson = localFont({
  src: "../../node_modules/@fontsource-variable/atkinson-hyperlegible-next/files/atkinson-hyperlegible-next-latin-wght-normal.woff2",
  variable: "--font-atkinson",
  weight: "200 800",
  display: "swap",
});

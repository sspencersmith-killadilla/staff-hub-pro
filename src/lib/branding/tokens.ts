// Brand token types shared by global / tenant / department branding layers.

export type BrandTokens = {
  primary?: string;
  secondary?: string;
  accent?: string;
  background?: string;
  foreground?: string;
  muted?: string;
  destructive?: string;
  // dark mode overrides
  darkPrimary?: string;
  darkBackground?: string;
  darkForeground?: string;
  darkAccent?: string;
  // shape + type
  radius?: string;
  headingFont?: string;
  bodyFont?: string;
};

export type BrandAssets = {
  logoLight?: string | null;
  logoDark?: string | null;
  logoIcon?: string | null;
  wordmark?: string | null;
  ogImage?: string | null;
  faviconSvg?: string | null;
  favicon32?: string | null;
  favicon180?: string | null;
  favicon512?: string | null;
};

export type ResolvedBrand = {
  tokens: BrandTokens;
  assets: BrandAssets;
  cityName: string;
};

export const DEFAULT_TOKENS: BrandTokens = {
  primary: "#2563eb",
  secondary: "#64748b",
  accent: "#7c3aed",
  background: "#ffffff",
  foreground: "#0f172a",
  muted: "#f1f5f9",
  destructive: "#dc2626",
  radius: "0.625rem",
  headingFont: "Inter",
  bodyFont: "Inter",
};

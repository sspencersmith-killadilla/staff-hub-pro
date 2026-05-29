export type FontPair = {
  id: string;
  label: string;
  heading: string;
  body: string;
  vibe: string;
};

export const FONT_PAIRS: FontPair[] = [
  { id: "inter-inter", label: "Inter / Inter", heading: "Inter", body: "Inter", vibe: "Neutral default" },
  { id: "space-grotesk-dm-sans", label: "Space Grotesk / DM Sans", heading: "Space Grotesk", body: "DM Sans", vibe: "Modern tech" },
  { id: "syne-plus-jakarta", label: "Syne / Plus Jakarta Sans", heading: "Syne", body: "Plus Jakarta Sans", vibe: "Creative startup" },
  { id: "outfit-figtree", label: "Outfit / Figtree", heading: "Outfit", body: "Figtree", vibe: "Lifestyle brand" },
  { id: "sora-manrope", label: "Sora / Manrope", heading: "Sora", body: "Manrope", vibe: "Digital tool" },
  { id: "instrument-serif-work-sans", label: "Instrument Serif / Work Sans", heading: "Instrument Serif", body: "Work Sans", vibe: "Modern editorial" },
  { id: "dm-serif-display-fira-sans", label: "DM Serif Display / Fira Sans", heading: "DM Serif Display", body: "Fira Sans", vibe: "Brand storytelling" },
  { id: "cormorant-karla", label: "Cormorant / Karla", heading: "Cormorant Garamond", body: "Karla", vibe: "Luxury fashion" },
  { id: "libre-baskerville-ibm-plex", label: "Libre Baskerville / IBM Plex Sans", heading: "Libre Baskerville", body: "IBM Plex Sans", vibe: "Law / finance" },
  { id: "lora-nunito-sans", label: "Lora / Nunito Sans", heading: "Lora", body: "Nunito Sans", vibe: "Blog / publishing" },
  { id: "bebas-neue-barlow", label: "Bebas Neue / Barlow", heading: "Bebas Neue", body: "Barlow", vibe: "Sports / events" },
  { id: "archivo-black-hind", label: "Archivo Black / Hind", heading: "Archivo Black", body: "Hind", vibe: "News / activism" },
  { id: "abril-fatface-cabin", label: "Abril Fatface / Cabin", heading: "Abril Fatface", body: "Cabin", vibe: "Creative portfolio" },
  { id: "jetbrains-mono-work-sans", label: "JetBrains Mono / Work Sans", heading: "JetBrains Mono", body: "Work Sans", vibe: "Tech docs" },
  { id: "space-mono-rubik", label: "Space Mono / Rubik", heading: "Space Mono", body: "Rubik", vibe: "Indie tech / gaming" },
];

export function findPair(headingFont?: string | null, bodyFont?: string | null): FontPair | null {
  if (!headingFont && !bodyFont) return null;
  return (
    FONT_PAIRS.find((p) => p.heading === headingFont && p.body === bodyFont) ?? null
  );
}

export function googleFontsUrl(pair: FontPair): string {
  const fams = Array.from(new Set([pair.heading, pair.body]))
    .map((f) => `family=${encodeURIComponent(f)}:wght@400;500;600;700`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${fams}&display=swap`;
}

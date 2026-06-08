import React from "react";
import { AbsoluteFill, Series, useCurrentFrame, interpolate, spring, useVideoConfig } from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";

const { fontFamily } = loadFont("normal", { weights: ["400", "700", "900"] });

export const FPS = 30;
export const WIDTH = 1280;
export const HEIGHT = 720;

// Palette — matches PDF
const INK = "#0F172A";
const PAPER = "#FAF7F0";
const ACCENT = "#B85042";
const ACCENT2 = "#2C5F2D";
const SAND = "#E2A77A";
const MUTED = "#64748B";

type Module = { n: number; name: string; tag: string; bullets: string[]; color: string };

const MODULES: Module[] = [
  { n: 1, name: "Events & Box Office", tag: "Sell tickets. Capture seats. Scan in.", bullets: ["Sessions, capacity, waitlist", "USAEPay payments", "Wallet QR for entry"], color: "#B85042" },
  { n: 2, name: "Venues", tag: "Parks, halls, stages — live.", bullets: ["Hours & holiday overrides", "Stages & rooms", "Powers the city map"], color: "#2C5F2D" },
  { n: 3, name: "Room Reservations", tag: "Bookable rooms with one queue.", bullets: ["Availability calendar", "Approval workflow", "Dept-scoped requests"], color: "#065A82" },
  { n: 4, name: "Classes", tag: "Recurring programs & rosters.", bullets: ["Series scheduling", "Waitlists", "Instructor attendance"], color: "#6D2E46" },
  { n: 5, name: "Vendors & Sponsors", tag: "Apply, approve, get paid.", bullets: ["Public application forms", "Review queue", "Auto-invoice & track"], color: "#A26769" },
  { n: 6, name: "Community Orgs", tag: "Nonprofits run their own events.", bullets: ["Verified org profiles", "Self-serve event posting", "Staff moderation"], color: "#028090" },
  { n: 7, name: "StreetBeats", tag: "Permitted street performance.", bullets: ["Busker applications", "Self-book stage slots", "Public 'who's playing'"], color: "#F96167" },
  { n: 8, name: "Social Command", tag: "One console. Every channel.", bullets: ["LinkedIn + Meta OAuth", "Schedule & dispatch", "Surveys & email blasts"], color: "#1E2761" },
  { n: 9, name: "Guidebook", tag: "Branded event PDF, auto-built.", bullets: ["Canvas editor", "Live data pull", "Per-tenant branding"], color: "#84B59F" },
  { n: 10, name: "Civic Quests", tag: "Gamified discovery of your city.", bullets: ["QR, geo, & honor waypoints", "Badges & points", "Leaderboard"], color: "#990011" },
  { n: 11, name: "Prizes & Raffles", tag: "Sponsor rewards for completion.", bullets: ["Prize catalog & inventory", "Redemption scanner", "Atomic raffle draws"], color: "#E2A77A" },
  { n: 12, name: "My Wallet", tag: "Tickets, prizes, raffles — unified.", bullets: ["Events · Prizes · Raffles tabs", "Scannable QR for everything", "Winner banner"], color: "#02C39A" },
  { n: 13, name: "311 Reports & Dispatch", tag: "Citizens report. Crews resolve.", bullets: ["Photo + pin + category", "Auto-route to dept", "Live status updates"], color: "#F9E795" },
  { n: 14, name: "Homepage Editor", tag: "WYSIWYG landing page control.", bullets: ["Hero, copy, CTA", "Toggle & reorder sections", "Per-tenant overrides"], color: "#CADCFC" },
];

const SCENE_FRAMES = 70; // ~2.33s each
const INTRO_FRAMES = 75;
const OUTRO_FRAMES = 90;
export const TOTAL_FRAMES = INTRO_FRAMES + MODULES.length * SCENE_FRAMES + OUTRO_FRAMES;

// ─── Persistent background ───────────────────────────────────────────
const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 60) * 20;
  return (
    <AbsoluteFill style={{ backgroundColor: INK, fontFamily }}>
      {/* subtle grid */}
      <svg width={WIDTH} height={HEIGHT} style={{ position: "absolute", opacity: 0.06 }}>
        <defs>
          <pattern id="g" width="60" height="60" patternUnits="userSpaceOnUse">
            <path d="M 60 0 L 0 0 0 60" fill="none" stroke={PAPER} strokeWidth="1" />
          </pattern>
        </defs>
        <rect width={WIDTH} height={HEIGHT} fill="url(#g)" />
      </svg>
      {/* drifting accent orbs */}
      <div style={{
        position: "absolute", width: 600, height: 600, borderRadius: "50%",
        background: `radial-gradient(circle, ${ACCENT}55, transparent 70%)`,
        top: -200 + drift, left: -150, filter: "blur(40px)",
      }} />
      <div style={{
        position: "absolute", width: 500, height: 500, borderRadius: "50%",
        background: `radial-gradient(circle, ${ACCENT2}44, transparent 70%)`,
        bottom: -150 - drift, right: -100, filter: "blur(40px)",
      }} />
    </AbsoluteFill>
  );
};

// ─── Intro ───────────────────────────────────────────────────────────
const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleY = spring({ frame, fps, config: { damping: 20, stiffness: 140 } });
  const subO = interpolate(frame, [20, 40], [0, 1], { extrapolateRight: "clamp" });
  const eyebrowO = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  const exit = interpolate(frame, [60, 75], [0, -40], { extrapolateRight: "clamp" });
  const exitO = interpolate(frame, [60, 75], [1, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ alignItems: "flex-start", justifyContent: "center", padding: 100, fontFamily }}>
      <div style={{ opacity: eyebrowO * exitO, transform: `translateY(${exit}px)` }}>
        <div style={{ color: SAND, fontSize: 18, fontWeight: 700, letterSpacing: 4, marginBottom: 24 }}>
          TOTAL EVENT SYSTEM  ·  OPERATOR WALKTHROUGH
        </div>
      </div>
      <div style={{
        color: PAPER, fontSize: 96, fontWeight: 900, lineHeight: 1.05,
        transform: `translateY(${(1 - titleY) * 40 + exit}px)`, opacity: titleY * exitO,
      }}>
        One platform.
      </div>
      <div style={{
        color: SAND, fontSize: 96, fontWeight: 900, lineHeight: 1.05,
        transform: `translateY(${(1 - titleY) * 40 + exit}px)`, opacity: titleY * exitO,
      }}>
        Fourteen modules.
      </div>
      <div style={{
        color: MUTED, fontSize: 24, fontWeight: 400, marginTop: 32,
        opacity: subO * exitO, transform: `translateY(${exit}px)`,
      }}>
        Built for the operators who run your city.
      </div>
    </AbsoluteFill>
  );
};

// ─── Module beat ─────────────────────────────────────────────────────
const ModuleBeat: React.FC<{ mod: Module }> = ({ mod }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const numIn = spring({ frame, fps, config: { damping: 12, stiffness: 180 } });
  const titleIn = spring({ frame: frame - 6, fps, config: { damping: 18, stiffness: 160 } });
  const tagIn = interpolate(frame, [12, 24], [0, 1], { extrapolateRight: "clamp" });
  const exitO = interpolate(frame, [SCENE_FRAMES - 12, SCENE_FRAMES], [1, 0], { extrapolateRight: "clamp" });
  const exitX = interpolate(frame, [SCENE_FRAMES - 12, SCENE_FRAMES], [0, -60], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ padding: 80, fontFamily }}>
      {/* Big number on right */}
      <div style={{
        position: "absolute", top: 60, right: 80, fontSize: 320, fontWeight: 900,
        color: mod.color, opacity: numIn * 0.25 * exitO,
        transform: `scale(${0.7 + numIn * 0.3})`, lineHeight: 1,
      }}>
        {String(mod.n).padStart(2, "0")}
      </div>

      <div style={{ height: 80 }} />

      <div style={{
        color: mod.color, fontSize: 16, fontWeight: 700, letterSpacing: 3,
        opacity: numIn * exitO, transform: `translateX(${exitX}px)`,
      }}>
        MODULE {String(mod.n).padStart(2, "0")} / 14
      </div>

      <div style={{
        color: PAPER, fontSize: 72, fontWeight: 900, lineHeight: 1.05, marginTop: 18,
        opacity: titleIn * exitO,
        transform: `translateY(${(1 - titleIn) * 30}px) translateX(${exitX}px)`,
        maxWidth: 900,
      }}>
        {mod.name}
      </div>

      <div style={{
        color: MUTED, fontSize: 26, marginTop: 16, opacity: tagIn * exitO,
        transform: `translateX(${exitX}px)`,
      }}>
        {mod.tag}
      </div>

      {/* bullets */}
      <div style={{ marginTop: 50, display: "flex", flexDirection: "column", gap: 18 }}>
        {mod.bullets.map((b, i) => {
          const bIn = spring({ frame: frame - (20 + i * 6), fps, config: { damping: 18, stiffness: 160 } });
          return (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 16,
              opacity: bIn * exitO, transform: `translateX(${(1 - bIn) * -40 + exitX}px)`,
            }}>
              <div style={{
                width: 14, height: 14, background: mod.color, borderRadius: 3,
                transform: `rotate(${bIn * 45}deg)`,
              }} />
              <div style={{ color: PAPER, fontSize: 28, fontWeight: 700 }}>{b}</div>
            </div>
          );
        })}
      </div>

      {/* Bottom accent bar */}
      <div style={{
        position: "absolute", bottom: 60, left: 80, right: 80, height: 4,
        background: `linear-gradient(90deg, ${mod.color}, transparent)`,
        opacity: exitO,
        transform: `scaleX(${interpolate(frame, [10, 40], [0, 1], { extrapolateRight: "clamp" })})`,
        transformOrigin: "left",
      }} />
    </AbsoluteFill>
  );
};

// ─── Outro ───────────────────────────────────────────────────────────
const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleIn = spring({ frame, fps, config: { damping: 18, stiffness: 140 } });
  const subIn = interpolate(frame, [20, 40], [0, 1], { extrapolateRight: "clamp" });
  const lineIn = interpolate(frame, [30, 60], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", fontFamily }}>
      <div style={{
        color: PAPER, fontSize: 88, fontWeight: 900, textAlign: "center",
        opacity: titleIn, transform: `translateY(${(1 - titleIn) * 30}px)`,
      }}>
        One wallet.
      </div>
      <div style={{
        color: SAND, fontSize: 88, fontWeight: 900, textAlign: "center", marginTop: 10,
        opacity: titleIn, transform: `translateY(${(1 - titleIn) * 30}px)`,
      }}>
        One city.
      </div>
      <div style={{
        height: 3, width: lineIn * 300, background: ACCENT, marginTop: 36, opacity: 0.9,
      }} />
      <div style={{
        color: MUTED, fontSize: 22, marginTop: 28, opacity: subIn, letterSpacing: 2,
      }}>
        TOTAL EVENT SYSTEM SOLUTIONS
      </div>
    </AbsoluteFill>
  );
};

export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill>
      <Background />
      <Series>
        <Series.Sequence durationInFrames={INTRO_FRAMES}><Intro /></Series.Sequence>
        {MODULES.map((m) => (
          <Series.Sequence key={m.n} durationInFrames={SCENE_FRAMES}>
            <ModuleBeat mod={m} />
          </Series.Sequence>
        ))}
        <Series.Sequence durationInFrames={OUTRO_FRAMES}><Outro /></Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};

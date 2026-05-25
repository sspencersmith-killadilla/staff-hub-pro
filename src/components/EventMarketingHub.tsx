import { useEffect, useState } from "react";

type Props = {
  event: any;
  sponsors: any[];
  talent: any[];
};

const EXPORT_SIZES: Record<string, { w: number; h: number }> = {
  flyer: { w: 816, h: 1056 },
  ig: { w: 1080, h: 1080 },
  fb: { w: 1200, h: 630 },
};

const SPONSOR_WIDTHS = { flyer: 620, ig: 920, fb: 616 };

const COLOR_STYLE_PROPS = new Set([
  "color",
  "background-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "outline-color",
  "fill",
  "stroke",
  "caret-color",
  "text-decoration-color",
  "column-rule-color",
]);

const COMPLEX_STYLE_FALLBACKS: Record<string, string> = {
  "box-shadow": "none",
  "text-shadow": "none",
  filter: "none",
  "backdrop-filter": "none",
};

function getNodeTree(root: HTMLElement) {
  return [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))];
}

function inlineSnapshotStyles(sourceRoot: HTMLElement, clonedRoot: HTMLElement, clonedDoc: Document) {
  const sourceNodes = getNodeTree(sourceRoot);
  const clonedNodes = getNodeTree(clonedRoot);
  const cloneWin = clonedDoc.defaultView || window;

  const resolver = clonedDoc.createElement("span");
  resolver.style.display = "none";
  clonedDoc.body.appendChild(resolver);

  const MODERN_COLOR_RE = /\b(oklch|oklab|color-mix|color\(|lab\(|lch\()/i;
  const hasModernColor = (v: string) => !!v && MODERN_COLOR_RE.test(v);

  const resolveColor = (value: string) => {
    if (!hasModernColor(value)) return value;
    try {
      resolver.style.color = "";
      resolver.style.color = value;
      const resolved = cloneWin.getComputedStyle(resolver).color;
      if (resolved && !hasModernColor(resolved)) return resolved;
    } catch {
      // fall through
    }
    return "rgb(0,0,0)";
  };

  sourceNodes.forEach((sourceNode, index) => {
    const clonedNode = clonedNodes[index];
    if (!clonedNode) return;

    const sourceStyles = window.getComputedStyle(sourceNode);
    const targetStyle = clonedNode.style;

    for (const prop of Array.from(sourceStyles)) {
      let value = sourceStyles.getPropertyValue(prop);
      if (!value) continue;

      if (hasModernColor(value)) {
        if (COLOR_STYLE_PROPS.has(prop)) {
          value = resolveColor(value);
        } else if (prop === "background-image") {
          value = targetStyle.backgroundImage || "none";
        } else if (prop in COMPLEX_STYLE_FALLBACKS) {
          value = COMPLEX_STYLE_FALLBACKS[prop];
        } else {
          // Unknown property containing a modern color function — skip to avoid html2canvas parse errors
          continue;
        }
      }

      if (!hasModernColor(value)) {
        targetStyle.setProperty(prop, value, sourceStyles.getPropertyPriority(prop));
      }
    }


    clonedNode.removeAttribute("class");
  });

  resolver.remove();
}

function loadHtml2Canvas(): Promise<any> {
  return new Promise((resolve, reject) => {
    if ((window as any).html2canvas) return resolve((window as any).html2canvas);
    const existing = document.querySelector('script[data-h2c="1"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve((window as any).html2canvas));
      existing.addEventListener("error", reject);
      return;
    }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
    s.async = true;
    s.dataset.h2c = "1";
    s.onload = () => resolve((window as any).html2canvas);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function toDataURL(url: string): Promise<string> {
  // Try direct fetch first; fall back to a CORS proxy for cross-origin images
  // whose servers don't send Access-Control-Allow-Origin.
  const attempts = [url, `https://images.weserv.nl/?url=${encodeURIComponent(url.replace(/^https?:\/\//, ""))}`];
  let lastErr: unknown;
  for (const u of attempts) {
    try {
      const res = await fetch(u, { mode: "cors" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("failed to fetch image");
}

export default function EventMarketingHub({ event, sponsors, talent }: Props) {
  const [activeTab, setActiveTab] = useState<"flyer" | "ig" | "fb">("flyer");
  const [ticketsHref, setTicketsHref] = useState("https://mckinneylibrary.org/tickets");
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [isDownloading, setIsDownloading] = useState(false);

  // Resolve venue/sub-stage/sub-room hierarchy.
  // Sessions link to either a stage (with parent venue) or a room (with parent venue).
  const stage: any = (event as any)?.stages ?? null;
  const room: any = (event as any)?.rooms ?? null;
  const venue: any = stage?.venues ?? room?.venues ?? null;

  const venueName: string =
    venue?.name || stage?.name || room?.name || "TBA";
  const subSpaceName: string | null = venue
    ? room?.name || stage?.name || null
    : null;
  const venueAddress: string = (() => {
    const parts = [
      venue?.address || stage?.address || null,
      venue?.city || null,
      venue?.state || null,
    ].filter(Boolean);
    return parts.length ? parts.join(", ") : "McKinney, TX";
  })();
  const locationPrimary = subSpaceName ? `${venueName} — ${subSpaceName}` : venueName;

  useEffect(() => {
    if (typeof window !== "undefined") {
      setTicketsHref(`${window.location.origin}/tickets`);
    }
    // Preload font + html2canvas
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;600;800;900&display=swap";
    document.head.appendChild(link);
    loadHtml2Canvas().catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    import("qrcode").then((QR) => {
      QR.toDataURL(ticketsHref, { margin: 1, width: 320, errorCorrectionLevel: "M" })
        .then((url) => {
          if (!cancelled) setQrDataUrl(url);
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [ticketsHref]);


  const getUniqueSponsors = () => {
    const seen = new Set();
    return sponsors.filter((s) => {
      const key = (s.logo_url || s.company_name || "").toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const fmt = activeTab;
      const elementId =
        fmt === "flyer" ? "flyer-capture-zone" : fmt === "ig" ? "ig-capture-zone" : "fb-capture-zone";
      const suffix = fmt === "flyer" ? "flyer" : fmt === "ig" ? "instagram" : "facebook";
      const { w, h } = EXPORT_SIZES[fmt];
      const element = document.getElementById(elementId);
      if (!element) {
        alert("Capture zone not found.");
        setIsDownloading(false);
        return;
      }
      const html2canvas = await loadHtml2Canvas();

      let eventImageDataUrl: string | null = null;
      if (event.image_url) {
        try {
          eventImageDataUrl = await toDataURL(event.image_url);
        } catch (e) {
          console.warn("Could not inline event image, it will be omitted:", e);
        }
      }
      const sponsorDataUrls: Record<string, string> = {};
      await Promise.all(
        sponsors
          .filter((s) => s.logo_url)
          .map(async (s) => {
            try {
              sponsorDataUrls[s.logo_url] = await toDataURL(s.logo_url);
            } catch (e) {
              console.warn("Could not inline sponsor logo, it will be omitted:", s.logo_url, e);
            }
          }),
      );

      const rect = element.getBoundingClientRect();
      const useWindowOverride = fmt === "ig";
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        ...(useWindowOverride ? { windowWidth: w, windowHeight: h } : {}),
        scrollX: -window.scrollX,
        scrollY: -window.scrollY,
        backgroundColor: null,
        logging: false,
        onclone: (clonedDoc: Document, clonedEl: HTMLElement) => {
          inlineSnapshotStyles(element as HTMLElement, clonedEl, clonedDoc);

          clonedDoc
            .querySelectorAll('style, link[rel="stylesheet"]:not([href*="fonts.googleapis.com"])')
            .forEach((node) => node.remove());

          const link = clonedDoc.createElement("link");
          link.rel = "stylesheet";
          link.href =
            "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=Inter:wght@400;600;800;900&display=swap";
          clonedDoc.head.appendChild(link);

          // Replace any background-image referencing the event image with the
          // inlined data URL (or strip it if we couldn't fetch it, to avoid tainting).
          clonedEl.querySelectorAll<HTMLElement>('[style*="background-image"]').forEach((el) => {
            if (event.image_url && el.style.backgroundImage.includes(event.image_url)) {
              if (eventImageDataUrl) {
                el.style.backgroundImage = `url(${eventImageDataUrl})`;
              } else {
                el.style.backgroundImage = "none";
                el.style.backgroundColor = "#ccfafa";
              }
            }
          });

          clonedEl.querySelectorAll("img").forEach((img) => {
            const original = img.getAttribute("src") || (img as HTMLImageElement).src;
            const dataUrl = sponsorDataUrls[original];
            if (dataUrl) {
              (img as HTMLImageElement).src = dataUrl;
            } else if (original && !original.startsWith("data:")) {
              // Drop logos we couldn't inline so the canvas doesn't taint.
              img.remove();
            }
          });

          if (fmt === "ig") {
            clonedEl.style.width = `${w}px`;
            clonedEl.style.height = `${h}px`;
            clonedEl.style.minHeight = `${h}px`;
            clonedEl.style.maxHeight = `${h}px`;
            clonedEl.style.overflow = "hidden";
          }
        },
      });

      let dataUrl: string;
      try {
        dataUrl = canvas.toDataURL("image/png");
      } catch (e) {
        console.error("Canvas tainted; cannot export. Source images may be cross-origin.", e);
        alert(
          "Could not export image because one of the source images is cross-origin and blocked download. Try re-uploading the event/sponsor images to your own storage.",
        );
        setIsDownloading(false);
        return;
      }
      const link = document.createElement("a");
      const safeTitle = (event?.title || "event").replace(/[^a-z0-9]/gi, "_").toLowerCase();
      link.download = `${safeTitle}_${suffix}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("Error generating image:", err);
      alert(`There was an error generating the image: ${(err as Error)?.message ?? err}`);
    }
    setIsDownloading(false);
  };

  const SponsorBar = ({
    containerWidth,
    maxTileSize = 120,
    gap = 12,
  }: {
    containerWidth: number;
    maxTileSize?: number;
    gap?: number;
  }) => {
    const list = getUniqueSponsors();
    if (list.length === 0) return null;
    const count = list.length;
    const totalGap = gap * (count - 1);
    const tileSize = Math.min(maxTileSize, Math.floor((containerWidth - totalGap) / count));
    const pad = Math.round(tileSize * 0.1);
    const imgSize = tileSize - pad * 2;
    return (
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2 text-center">
          Proudly Supported By
        </p>
        <div className="flex justify-center items-center" style={{ gap: `${gap}px` }}>
          {list.map((s, i) => (
            <div
              key={i}
              style={{
                width: tileSize,
                height: tileSize,
                padding: pad,
                background: "#fff",
                border: "1px solid #f3f4f6",
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {s.logo_url ? (
                <img
                  src={s.logo_url}
                  alt={s.company_name || "sponsor"}
                  style={{ width: imgSize, height: imgSize, objectFit: "contain" }}
                  crossOrigin="anonymous"
                />
              ) : (
                <span className="text-teal-700 font-black">
                  {s.company_name?.charAt(0).toUpperCase() || "S"}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const RunOfShow = () => {
    if (!talent || talent.length === 0) return null;
    return (
      <div>
        <p className="uppercase text-[10px] font-bold tracking-widest text-teal-700 mb-2">Run of Show</p>
        <div className="space-y-1">
          {talent.map((t) => (
            <p key={t.id} className="text-sm font-bold text-gray-900 leading-tight">
              • {t.name} <span className="text-gray-400 font-medium">({t.role})</span>
            </p>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="-m-8">
      {/* ACTION BAR */}
      <div className="bg-[#093140] text-white p-4 flex flex-col md:flex-row md:justify-between md:items-center gap-4 shadow-lg">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTab("flyer")}
            className={`px-4 py-2 text-xs font-bold rounded-lg ${activeTab === "flyer" ? "bg-teal-500" : "bg-[#145A6D] hover:bg-teal-600"}`}
          >
            Press Flyer (8.5×11)
          </button>
          <button
            onClick={() => setActiveTab("ig")}
            className={`px-4 py-2 text-xs font-bold rounded-lg ${activeTab === "ig" ? "bg-teal-500" : "bg-[#145A6D] hover:bg-teal-600"}`}
          >
            Instagram (1:1)
          </button>
          <button
            onClick={() => setActiveTab("fb")}
            className={`px-4 py-2 text-xs font-bold rounded-lg ${activeTab === "fb" ? "bg-teal-500" : "bg-[#145A6D] hover:bg-teal-600"}`}
          >
            Facebook (Landscape)
          </button>
        </div>
        <div className="flex gap-2">
          {activeTab === "flyer" && (
            <button
              onClick={() => window.print()}
              className="bg-[#145A6D] hover:bg-teal-600 border border-teal-500 text-white px-5 py-2.5 rounded-lg font-bold text-xs"
            >
              Print PDF
            </button>
          )}
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="bg-white hover:bg-gray-100 text-[#093140] px-5 py-2.5 rounded-lg font-bold text-xs disabled:opacity-50 shadow-md"
          >
            {isDownloading ? "Rendering…" : "Download High-Res PNG"}
          </button>
        </div>
      </div>

      <div className="min-h-screen bg-[#093140] flex flex-col items-center p-8 font-['Inter'] antialiased overflow-x-auto">
        {/* FLYER 8.5x11 */}
        {activeTab === "flyer" && (
          <div
            id="flyer-capture-zone"
            className="bg-[#093140] flex flex-col p-8 shrink-0"
            style={{ width: "8.5in", height: "11in" }}
          >
            <div className="w-full h-full bg-white rounded-3xl flex flex-col shadow-2xl overflow-hidden border-4 border-[#145A6D]/20">
              <div className="w-full relative shrink-0" style={{ height: "40%" }}>
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    backgroundImage: event.image_url ? `url(${event.image_url})` : undefined,
                    backgroundSize: "cover",
                    backgroundPosition: "center top",
                    backgroundColor: event.image_url ? undefined : "#ccfafa",
                  }}
                >
                  {!event.image_url && (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-teal-200 font-black text-4xl">MCKINNEY EVENTS</span>
                    </div>
                  )}
                </div>
                <div className="absolute bottom-0 left-0 w-full h-1/3 bg-gradient-to-t from-black/50 to-transparent" />
              </div>
              <div className="flex-1 p-12 flex flex-col bg-white">
                <p className="text-teal-600 font-extrabold tracking-widest text-xs uppercase mb-3">
                  {event.event_type || "Official Municipal Event"}
                </p>
                <h1
                  className="text-5xl text-[#093140] font-black leading-[1.05] mb-8"
                  style={{ fontFamily: "'Playfair Display', serif" }}
                >
                  {event.title}
                </h1>
                <div className="grid grid-cols-2 gap-10 flex-1">
                  <div className="flex flex-col gap-6">
                    <div>
                      <p className="uppercase text-[10px] font-bold tracking-widest text-gray-400 mb-1">
                        Featured Presenter
                      </p>
                      <p className="text-2xl font-black text-gray-900 leading-tight">
                        {event.speaker_name || "Special Guest"}
                      </p>
                    </div>
                    {event.start_time && (
                      <div>
                        <p className="uppercase text-[10px] font-bold tracking-widest text-gray-400 mb-1">
                          Date & Time
                        </p>
                        <p className="text-lg font-bold text-gray-900 leading-tight">
                          {new Date(event.start_time).toLocaleDateString("en-US", {
                            weekday: "long",
                            month: "long",
                            day: "numeric",
                          })}
                        </p>
                        <p className="text-sm font-bold text-teal-600">
                          at{" "}
                          {new Date(event.start_time).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="uppercase text-[10px] font-bold tracking-widest text-gray-400 mb-1">
                        Location
                      </p>
                      <p className="text-lg font-bold text-gray-900 leading-tight pr-4">
                        {locationPrimary}
                      </p>
                      <p className="text-xs text-gray-500 leading-tight pr-4 mt-1">
                        {venueAddress}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <RunOfShow />
                    <div className="mt-auto pt-6">
                      <div className="bg-teal-50 rounded-xl p-5 border border-teal-100 w-full flex items-center gap-4">
                        <a
                          href={ticketsHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 bg-white rounded-lg p-1.5 border border-teal-200 hover:border-teal-400 transition"
                          aria-label="Open admissions & tickets page"
                          title="Scan or click to open tickets"
                        >
                          {qrDataUrl ? (
                            <img src={qrDataUrl} alt="Tickets QR code" width={96} height={96} />
                          ) : (
                            <div style={{ width: 96, height: 96 }} />
                          )}
                        </a>
                        <div className="min-w-0">
                          <p className="text-teal-800 font-black uppercase tracking-widest text-[10px] mb-1">
                            Admissions & Tickets
                          </p>
                          <p className="text-[10px] text-teal-700 mt-1">Scan or tap to open</p>
                        </div>
                      </div>

                    </div>
                  </div>
                </div>
                <div className="mt-8 pt-6 border-t border-gray-100">
                  <SponsorBar containerWidth={SPONSOR_WIDTHS.flyer} maxTileSize={110} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* INSTAGRAM 1:1 */}
        {activeTab === "ig" && (
          <div
            id="ig-capture-zone"
            className="bg-[#093140] flex flex-col p-10 shrink-0"
            style={{ width: 1080, minHeight: 1080 }}
          >
            <div
              className="w-full bg-white rounded-[2.5rem] flex flex-col shadow-2xl overflow-hidden border-4 border-[#145A6D]/20"
              style={{ minHeight: 1004 }}
            >
              <div className="w-full shrink-0" style={{ height: 380 }}>
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    backgroundImage: event.image_url ? `url(${event.image_url})` : undefined,
                    backgroundSize: "cover",
                    backgroundPosition: "center top",
                    backgroundColor: event.image_url ? undefined : "#ccfafa",
                  }}
                >
                  {!event.image_url && (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-teal-200 font-black text-6xl">MCKINNEY EVENTS</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1 px-10 pt-8 pb-10 flex flex-col bg-white gap-5">
                <div>
                  <p className="text-teal-600 font-extrabold tracking-widest text-xs uppercase mb-2">
                    {event.event_type || "Official Municipal Event"}
                  </p>
                  <h1
                    className="text-[2.75rem] text-[#093140] font-black leading-[1.05]"
                    style={{ fontFamily: "'Playfair Display', serif" }}
                  >
                    {event.title}
                  </h1>
                </div>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="uppercase text-[11px] font-bold tracking-widest text-gray-400 mb-1">
                      Featured Presenter
                    </p>
                    <p className="text-2xl font-black text-gray-900 leading-tight">
                      {event.speaker_name || "Special Guest"}
                    </p>
                  </div>
                  {event.start_time && (
                    <div>
                      <p className="uppercase text-[11px] font-bold tracking-widest text-gray-400 mb-1">
                        When
                      </p>
                      <p className="text-xl font-bold text-gray-900 leading-tight">
                        {new Date(event.start_time).toLocaleDateString("en-US", {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                        })}
                      </p>
                      <p className="text-lg font-bold text-teal-600">
                        at{" "}
                        {new Date(event.start_time).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  )}
                </div>
                <RunOfShow />
                <div className="bg-teal-50 rounded-2xl p-5 border border-teal-100 w-full flex items-center gap-5">
                  <a
                    href={ticketsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 bg-white rounded-xl p-2 border border-teal-200 hover:border-teal-400 transition"
                    aria-label="Open admissions & tickets page"
                    title="Scan or click to open tickets"
                  >
                    {qrDataUrl ? (
                      <img src={qrDataUrl} alt="Tickets QR code" width={128} height={128} />
                    ) : (
                      <div style={{ width: 128, height: 128 }} />
                    )}
                  </a>
                  <div className="min-w-0">
                    <p className="text-teal-800 font-black uppercase tracking-widest text-[11px] mb-1">
                      Admissions & Tickets
                    </p>
                    <p className="text-[11px] text-teal-700 mt-2">Scan or tap to open</p>
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100">
                  <SponsorBar containerWidth={SPONSOR_WIDTHS.ig} maxTileSize={140} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* FACEBOOK 1.9:1 */}
        {activeTab === "fb" && (
          <div
            id="fb-capture-zone"
            style={{
              width: 1200,
              height: 630,
              background: "#093140",
              display: "flex",
              padding: 24,
              flexShrink: 0,
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                background: "white",
                borderRadius: 28,
                display: "flex",
                boxShadow: "0 25px 50px -12px rgba(0,0,0,0.25)",
                overflow: "hidden",
                border: "4px solid rgba(20,90,109,0.2)",
              }}
            >
              <div style={{ width: 460, height: "100%", flexShrink: 0 }}>
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    backgroundImage: event.image_url ? `url(${event.image_url})` : undefined,
                    backgroundSize: "cover",
                    backgroundPosition: "center top",
                    backgroundColor: event.image_url ? undefined : "#ccfafa",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {!event.image_url && (
                    <span style={{ color: "#99f6e4", fontWeight: 900, fontSize: "2rem", textAlign: "center" }}>
                      MCKINNEY
                      <br />
                      EVENTS
                    </span>
                  )}
                </div>
              </div>
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: "100%",
                  padding: "36px 36px 32px 36px",
                  display: "flex",
                  flexDirection: "column",
                  background: "white",
                }}
              >
                <p
                  style={{
                    color: "#0d9488",
                    fontWeight: 800,
                    letterSpacing: "0.12em",
                    fontSize: 10,
                    textTransform: "uppercase",
                    margin: "0 0 6px 0",
                  }}
                >
                  {event.event_type || "Official Municipal Event"}
                </p>
                <h1
                  style={{
                    fontFamily: "'Playfair Display', serif",
                    color: "#093140",
                    fontWeight: 900,
                    fontSize: "1.75rem",
                    lineHeight: 1.1,
                    margin: "0 0 16px 0",
                  }}
                >
                  {event.title}
                </h1>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 16,
                    marginBottom: 14,
                  }}
                >
                  <div>
                    <p
                      style={{
                        textTransform: "uppercase",
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        color: "#9ca3af",
                        margin: "0 0 3px 0",
                      }}
                    >
                      Featured Presenter
                    </p>
                    <p style={{ fontSize: 15, fontWeight: 900, color: "#111827", lineHeight: 1.2, margin: 0 }}>
                      {event.speaker_name || "Special Guest"}
                    </p>
                  </div>
                  <div>
                    <p
                      style={{
                        textTransform: "uppercase",
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        color: "#0f766e",
                        margin: "0 0 3px 0",
                      }}
                    >
                      Run of Show
                    </p>
                    {talent.map((t) => (
                      <p
                        key={t.id}
                        style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: "0 0 2px 0" }}
                      >
                        • {t.name}{" "}
                        <span style={{ color: "#9ca3af", fontWeight: 500, fontSize: 11 }}>({t.role})</span>
                      </p>
                    ))}
                  </div>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 16,
                    marginBottom: 16,
                  }}
                >
                  {event.start_time && (
                    <div>
                      <p
                        style={{
                          textTransform: "uppercase",
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: "0.1em",
                          color: "#9ca3af",
                          margin: "0 0 3px 0",
                        }}
                      >
                        When
                      </p>
                      <p
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          color: "#111827",
                          lineHeight: 1.3,
                          margin: "0 0 2px 0",
                        }}
                      >
                        {new Date(event.start_time).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          weekday: "long",
                        })}
                      </p>
                      <p style={{ fontSize: 13, fontWeight: 700, color: "#0d9488", margin: 0 }}>
                        at{" "}
                        {new Date(event.start_time).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  )}
                  <div>
                    <p
                      style={{
                        textTransform: "uppercase",
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        color: "#9ca3af",
                        margin: "0 0 3px 0",
                      }}
                    >
                      Where
                    </p>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#111827",
                        lineHeight: 1.3,
                        margin: "0 0 2px 0",
                      }}
                    >
                      {event.stages?.name}
                    </p>
                    <p style={{ fontSize: 11, color: "#6b7280", margin: 0 }}>
                      {event.stages?.address?.split(",")[0]}
                    </p>
                  </div>
                </div>
                <div
                  style={{
                    background: "#f0fdfa",
                    borderRadius: 12,
                    padding: "12px 16px",
                    border: "1px solid #ccfbf1",
                    marginBottom: 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <a
                    href={ticketsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Scan or click to open tickets"
                    style={{
                      flexShrink: 0,
                      background: "#fff",
                      borderRadius: 8,
                      padding: 4,
                      border: "1px solid #99f6e4",
                      lineHeight: 0,
                    }}
                  >
                    {qrDataUrl ? (
                      <img src={qrDataUrl} alt="Tickets QR code" width={84} height={84} />
                    ) : (
                      <div style={{ width: 84, height: 84 }} />
                    )}
                  </a>
                  <div style={{ minWidth: 0 }}>
                    <p
                      style={{
                        color: "#134e4a",
                        fontWeight: 900,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        fontSize: 9,
                        margin: "0 0 3px 0",
                      }}
                    >
                      Admissions & Tickets
                    </p>
                    <p style={{ fontSize: 10, color: "#0f766e", margin: "4px 0 0 5px" }}>
                      Scan or tap to open
                    </p>
                  </div>
                </div>

                <div style={{ borderTop: "1px solid #f3f4f6", paddingTop: 12 }}>
                  <SponsorBar containerWidth={SPONSOR_WIDTHS.fb} maxTileSize={90} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

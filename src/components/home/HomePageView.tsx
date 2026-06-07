import { Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { useModules } from "@/hooks/use-modules";
import { useAuth } from "@/hooks/use-auth";
import type {
  HomeContent,
  HeroSecondaryCta,
  HomeSection,
} from "@/lib/home-content.functions";
import {
  ICON_REGISTRY,
  portalThemeClasses,
  explainerThemeClasses,
} from "./icon-registry";

const NAVY = "#002f49";

export function HomePageView({
  content,
  showHeader = true,
}: {
  content: HomeContent;
  showHeader?: boolean;
}) {
  const year = new Date().getFullYear();
  const { isEnabled, flags } = useModules();
  const { isAuthenticated, me } = useAuth();

  function moduleAllows(key?: string | null) {
    if (!key) return true;
    return (flags as Record<string, boolean>)[key] ?? true;
  }

  return (
    <div className="min-h-dvh bg-[#f8fafc] flex flex-col font-sans text-foreground">
      {showHeader && <SiteHeader />}

      {/* HERO */}
      <header
        className="text-white py-20 px-6 relative overflow-hidden"
        style={{ backgroundColor: NAVY }}
      >
        <div
          className="absolute top-0 right-0 w-96 h-96 bg-blue-500 opacity-20 rounded-full blur-3xl translate-x-1/3 -translate-y-1/3 pointer-events-none"
          aria-hidden="true"
        />
        <div className="max-w-7xl mx-auto relative z-10 text-center md:text-left flex flex-col md:flex-row items-center gap-12">
          <div className="flex-1">
            {content.hero_badge && (
              <span className="inline-block bg-amber-500 text-amber-950 font-black uppercase tracking-widest text-[10px] px-3 py-1 rounded-full mb-6">
                {content.hero_badge}
              </span>
            )}
            <h1 className="text-5xl md:text-6xl text-white mb-6 leading-tight tracking-tight font-black">
              {content.hero_title}
            </h1>
            {content.hero_subtitle && (
              <p className="text-lg text-blue-100 mb-8 max-w-full leading-relaxed">
                {content.hero_subtitle}
              </p>
            )}
            {isAuthenticated && content.hero_authed_message && (
              <div className="mb-8 rounded-xl border border-white/20 bg-white/10 p-5 backdrop-blur">
                <p className="text-xs font-black uppercase tracking-widest text-amber-300">
                  Signed in{me?.email ? ` as ${me.email}` : ""}
                </p>
                <p className="mt-1 text-white">{content.hero_authed_message}</p>
                <Link
                  to="/hub"
                  className="mt-3 inline-block bg-amber-400 hover:bg-amber-300 text-amber-950 font-black py-2.5 px-5 rounded-lg uppercase tracking-wider text-xs shadow"
                >
                  Go to My Hub →
                </Link>
              </div>
            )}
            {!isAuthenticated && content.hero_signup_cta_label && (
              <div className="mb-8 flex flex-wrap items-center gap-3">
                <Link
                  to="/signup"
                  className="bg-amber-400 hover:bg-amber-300 text-amber-950 font-black py-2.5 px-5 rounded-lg uppercase tracking-wider text-xs shadow"
                >
                  {content.hero_signup_cta_label}
                </Link>
                {content.hero_login_cta_label && (
                  <Link
                    to="/login"
                    className="text-white/90 hover:text-white underline text-sm"
                  >
                    {content.hero_login_cta_label}
                  </Link>
                )}
              </div>
            )}
            <nav
              aria-label="Primary actions"
              className="flex flex-wrap gap-4 justify-center md:justify-start"
            >
              {content.hero_secondary_ctas
                .filter((c) => moduleAllows(c.requires_module))
                .map((cta, idx) => (
                  <HeroCta key={idx} cta={cta} />
                ))}
            </nav>
          </div>
        </div>
      </header>

      {/* SECTIONS */}
      {content.sections.map((section, idx) => (
        <SectionRenderer
          key={section.id ?? idx}
          section={section}
          isEnabled={isEnabled as (k: string) => boolean}
          moduleAllows={moduleAllows}
        />
      ))}

      {/* FOOTER */}
      <footer className="bg-[#001f2b] text-muted-foreground py-12 text-center mt-auto border-t border-[#002f49]">
        <div className="max-w-4xl mx-auto px-6">
          {content.footer_tagline && (
            <p className="text-xs font-black uppercase tracking-[0.3em] mb-4 text-muted-foreground">
              {content.footer_tagline}
            </p>
          )}
          {content.footer_body && (
            <p className="text-sm text-muted-foreground mb-6">{content.footer_body}</p>
          )}
          {content.footer_copyright && (
            <p className="text-[10px] font-bold tracking-widest uppercase">
              {content.footer_copyright} © {year}
            </p>
          )}
        </div>
      </footer>
    </div>
  );
}

function HeroCta({ cta }: { cta: HeroSecondaryCta }) {
  const isPrimary = cta.style === "primary" || cta.style === undefined;
  // Default first CTA primary-emerald; others outline-style
  const className = isPrimary
    ? "bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-6 rounded-lg transition-colors shadow-lg text-center uppercase tracking-wider text-sm w-full sm:w-auto"
    : "bg-white/10 hover:bg-white/20 text-white border border-white/30 font-bold py-3 px-6 rounded-lg transition-colors text-center uppercase tracking-wider text-sm w-full sm:w-auto";
  if (cta.href.startsWith("/")) {
    return (
      <Link to={cta.href as any} className={className}>
        {cta.label}
      </Link>
    );
  }
  return (
    <a href={cta.href} className={className} target="_blank" rel="noreferrer">
      {cta.label}
    </a>
  );
}

function SectionRenderer({
  section,
  moduleAllows,
}: {
  section: HomeSection;
  isEnabled: (k: string) => boolean;
  moduleAllows: (k?: string | null) => boolean;
}) {
  if (section.type === "portal_cards") {
    const visible = section.items.filter((i) => moduleAllows(i.requires_module));
    if (visible.length === 0) return null;
    return (
      <section
        className="py-16 px-6 max-w-7xl mx-auto w-full -mt-12 relative z-20"
        aria-label={section.title ?? "Quick access portals"}
      >
        <div className="flex flex-wrap justify-center gap-6">
          {visible.map((item) => {
            const t = portalThemeClasses(item.color_theme);
            const Icon = ICON_REGISTRY[item.icon] ?? ICON_REGISTRY.ticket;
            return (
              <div
                key={item.id}
                className="bg-white p-8 rounded-2xl shadow-lg hover:shadow-2xl transition-shadow w-full sm:w-[340px] flex flex-col"
              >
                <div className={`w-14 h-14 rounded-xl border flex items-center justify-center mb-5 ${t.iconBg}`}>
                  <Icon className={`w-7 h-7 ${t.iconColor}`} />
                </div>
                <h3 className="text-xl font-black mb-3" style={{ color: NAVY }}>
                  {item.title}
                </h3>
                <p className="text-sm text-muted-foreground mb-5 flex-1">{item.description}</p>
                {item.link_to.startsWith("/") ? (
                  <Link
                    to={item.link_to as any}
                    className={`text-sm font-black uppercase tracking-wider ${t.linkColor} hover:underline`}
                  >
                    {item.link_text}
                  </Link>
                ) : (
                  <a
                    href={item.link_to}
                    className={`text-sm font-black uppercase tracking-wider ${t.linkColor} hover:underline`}
                  >
                    {item.link_text}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </section>
    );
  }
  if (section.type === "explainer_cards") {
    return (
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          {(section.title || section.subtitle) && (
            <div className="text-center mb-16">
              {section.title && (
                <h2
                  className="text-4xl font-black mb-4 tracking-tight"
                  style={{ color: NAVY }}
                >
                  {section.title}
                </h2>
              )}
              {section.subtitle && (
                <p className="text-muted-foreground max-w-2xl mx-auto text-lg">
                  {section.subtitle}
                </p>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 justify-center">
            {section.items.map((item) => {
              const t = explainerThemeClasses(item.color_theme);
              return (
                <div
                  key={item.id}
                  className={`bg-white rounded-2xl p-8 border-t-4 shadow-lg hover:shadow-xl transition-shadow ${t.border}`}
                >
                  <div className="flex items-center gap-3 mb-5">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${t.iconBg}`}>
                      <span className="font-black">★</span>
                    </div>
                    <h3 className="text-lg font-black" style={{ color: NAVY }}>
                      {item.title}
                    </h3>
                  </div>
                  <ol className="space-y-3 text-sm text-muted-foreground">
                    {item.steps.map((step, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <span
                          className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs mt-0.5 ${t.chipBg} ${t.chipText}`}
                        >
                          {i + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    );
  }
  if (section.type === "rich_text") {
    const bg =
      section.background === "navy"
        ? { backgroundColor: NAVY, color: "white" }
        : section.background === "muted"
          ? { backgroundColor: "#f1f5f9" }
          : { backgroundColor: "white" };
    return (
      <section style={bg} className="py-16 px-6">
        <div
          className={`max-w-4xl mx-auto ${section.align === "center" ? "text-center" : ""}`}
        >
          {section.title && (
            <h2 className="text-3xl font-black mb-4 tracking-tight">
              {section.title}
            </h2>
          )}
          <div className="prose prose-slate max-w-none whitespace-pre-wrap">
            {section.body_md}
          </div>
        </div>
      </section>
    );
  }
  if (section.type === "image_banner") {
    const inner = (
      <figure className="max-w-7xl mx-auto px-6">
        <img
          src={section.image_url}
          alt={section.alt}
          className="w-full rounded-2xl shadow-lg object-cover"
        />
        {section.caption && (
          <figcaption className="text-center text-sm text-muted-foreground mt-3">
            {section.caption}
          </figcaption>
        )}
      </figure>
    );
    return (
      <section className="py-12 bg-white">
        {section.href ? (
          <a href={section.href} className="block">
            {inner}
          </a>
        ) : (
          inner
        )}
      </section>
    );
  }
  if (section.type === "cta_band") {
    const bg =
      section.background === "amber"
        ? { backgroundColor: "#f59e0b", color: "#451a03" }
        : section.background === "white"
          ? { backgroundColor: "white", color: NAVY }
          : { backgroundColor: NAVY, color: "white" };
    return (
      <section style={bg} className="py-16 px-6">
        <div className="max-w-5xl mx-auto text-center">
          <h2 className="text-3xl font-black mb-4 tracking-tight">{section.headline}</h2>
          {section.body && (
            <p className="text-lg opacity-90 mb-8 max-w-2xl mx-auto">{section.body}</p>
          )}
          <div className="flex flex-wrap justify-center gap-3">
            {section.buttons.map((b, i) => (
              <a
                key={i}
                href={b.href}
                className="bg-white text-foreground font-bold py-3 px-6 rounded-lg uppercase tracking-wider text-sm shadow hover:bg-slate-100"
              >
                {b.label}
              </a>
            ))}
          </div>
        </div>
      </section>
    );
  }
  return null;
}

import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { HomePageView } from "@/components/home/HomePageView";
import { getHomeContent, type HomeContent } from "@/lib/home-content.functions";
import { DEFAULT_HOME_CONTENT } from "@/lib/home-content-defaults";

function homeQueryOptions(host: string) {
  return queryOptions({
    queryKey: ["home-content", host],
    queryFn: () => getHomeContent({ data: { host } }),
  });
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Community Event & Partnership Portal" },
      {
        name: "description",
        content:
          "Discover upcoming events, partner with us, join the StreetBeats roster, or reserve a meeting room.",
      },
      { property: "og:title", content: "Community Event & Partnership Portal" },
    ],
  }),
  loader: ({ context }) => {
    const host = typeof window !== "undefined" ? window.location.host : "";
    return context.queryClient.ensureQueryData(homeQueryOptions(host));
  },
  component: Home,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">
      Couldn't load home page: {error.message}
    </div>
  ),
});

function Home() {
  const host = typeof window !== "undefined" ? window.location.host : "";
  const { data } = useSuspenseQuery(homeQueryOptions(host));
  const content: HomeContent = (data as HomeContent | null) ?? DEFAULT_HOME_CONTENT;
  return <HomePageView content={content} />;
}

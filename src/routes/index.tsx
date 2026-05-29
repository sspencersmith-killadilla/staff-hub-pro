import { createFileRoute } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { HomePageView } from "@/components/home/HomePageView";
import { getHomeContent, type HomeContent } from "@/lib/home-content.functions";
import { DEFAULT_HOME_CONTENT } from "@/lib/home-content-defaults";

const homeQueryOptions = queryOptions({
  queryKey: ["home-content"],
  queryFn: () => getHomeContent(),
});

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
  loader: ({ context }) => context.queryClient.ensureQueryData(homeQueryOptions),
  component: Home,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">
      Couldn't load home page: {error.message}
    </div>
  ),
});

function Home() {
  const { data } = useSuspenseQuery(homeQueryOptions);
  const content: HomeContent = (data as HomeContent | null) ?? DEFAULT_HOME_CONTENT;
  return <HomePageView content={content} />;
}

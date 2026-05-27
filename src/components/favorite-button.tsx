import { Heart } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import {
  listMyFavoriteKeys,
  toggleFavorite,
  type FavType,
} from "@/lib/favorites.functions";

interface Props {
  itemType: FavType;
  itemId: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  label?: boolean;
}

const sizeMap = { sm: "h-4 w-4", md: "h-5 w-5", lg: "h-6 w-6" };

export function FavoriteButton({
  itemType,
  itemId,
  className,
  size = "md",
  label = false,
}: Props) {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchKeys = useServerFn(listMyFavoriteKeys);
  const doToggle = useServerFn(toggleFavorite);

  const keys = useQuery({
    queryKey: ["favorites", "keys"],
    queryFn: () => fetchKeys(),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const isFav = !!keys.data?.some(
    (k) => k.item_type === itemType && k.item_id === itemId,
  );

  const m = useMutation({
    mutationFn: () => doToggle({ data: { item_type: itemType, item_id: itemId } }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["favorites"] });
      qc.invalidateQueries({ queryKey: ["itinerary"] });
      toast.success(res.favorited ? "Added to My Schedule" : "Removed from My Schedule");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not update favorite"),
  });

  const onClick = () => {
    if (!isAuthenticated) {
      toast("Log in to save favorites");
      navigate({ to: "/login" });
      return;
    }
    m.mutate();
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={m.isPending}
      aria-pressed={isFav}
      aria-label={isFav ? "Remove from My Schedule" : "Add to My Schedule"}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border bg-white/90 px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50",
        isFav
          ? "border-rose-300 text-rose-600 hover:bg-rose-50"
          : "border-slate-300 text-slate-700 hover:bg-slate-50",
        className,
      )}
    >
      <Heart
        className={cn(sizeMap[size], isFav && "fill-rose-500 text-rose-500")}
      />
      {label && <span>{isFav ? "Saved" : "Save"}</span>}
    </button>
  );
}

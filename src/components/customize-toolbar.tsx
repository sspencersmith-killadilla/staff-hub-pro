import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  editing: boolean;
  onToggleEditing: () => void;
  onReset: () => void;
};

export function CustomizeToolbar({ editing, onToggleEditing, onReset }: Props) {
  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant={editing ? "default" : "outline"}
        onClick={onToggleEditing}
        className="gap-1.5"
      >
        <Settings2 className="h-3.5 w-3.5" />
        {editing ? "Done" : "Customize"}
      </Button>
      {editing && (
        <Button size="sm" variant="ghost" onClick={onReset} className="gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" /> Reset
        </Button>
      )}
    </div>
  );
}

type ControlsProps = {
  id: string;
  index: number;
  total: number;
  isHidden: boolean;
  onMove: (id: string, dir: -1 | 1) => void;
  onToggleHidden: (id: string) => void;
};

export function SectionControls({
  id,
  index,
  total,
  isHidden,
  onMove,
  onToggleHidden,
}: ControlsProps) {
  return (
    <div className="flex items-center gap-1 rounded-md border border-dashed border-primary/40 bg-primary/5 p-1">
      <button
        type="button"
        onClick={() => onMove(id, -1)}
        disabled={index === 0}
        className="rounded p-1 text-foreground/70 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-30"
        aria-label="Move up"
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onMove(id, 1)}
        disabled={index === total - 1}
        className="rounded p-1 text-foreground/70 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-30"
        aria-label="Move down"
      >
        <ArrowDown className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onToggleHidden(id)}
        className="rounded p-1 text-foreground/70 hover:bg-primary/10"
        aria-label={isHidden ? "Show section" : "Hide section"}
      >
        {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

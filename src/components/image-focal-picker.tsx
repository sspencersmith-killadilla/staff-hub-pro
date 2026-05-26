import { useRef, useState } from "react";

type Props = {
  src: string;
  x: number; // 0-100
  y: number; // 0-100
  onChange: (next: { x: number; y: number }) => void;
};

/**
 * Click or drag on the image to set the focal point. The crosshair shows
 * what part of the image will stay visible inside a cropped (object-cover) frame.
 */
export function ImageFocalPicker({ src, x, y, onChange }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  function update(clientX: number, clientY: number) {
    const el = boxRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const nx = Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100));
    const ny = Math.max(0, Math.min(100, ((clientY - r.top) / r.height) * 100));
    onChange({ x: Math.round(nx), y: Math.round(ny) });
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">Focal point</span>
        <span className="text-[10px] text-slate-500">
          {x}% × {y}% — click or drag to pick the best spot
        </span>
      </div>
      <div
        ref={boxRef}
        className="relative aspect-[16/9] w-full cursor-crosshair overflow-hidden rounded-md border border-slate-200 bg-slate-100 select-none"
        onMouseDown={(e) => {
          setDragging(true);
          update(e.clientX, e.clientY);
        }}
        onMouseMove={(e) => {
          if (dragging) update(e.clientX, e.clientY);
        }}
        onMouseUp={() => setDragging(false)}
        onMouseLeave={() => setDragging(false)}
        onTouchStart={(e) => {
          const t = e.touches[0];
          if (t) update(t.clientX, t.clientY);
        }}
        onTouchMove={(e) => {
          const t = e.touches[0];
          if (t) update(t.clientX, t.clientY);
        }}
      >
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <img
          src={src}
          className="pointer-events-none h-full w-full object-contain"
          draggable={false}
        />
        <div
          className="pointer-events-none absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sky-500/80 shadow-[0_0_0_2px_rgba(0,0,0,0.4)]"
          style={{ left: `${x}%`, top: `${y}%` }}
        />
      </div>
      <p className="text-[10px] text-slate-500">
        Preview below shows how the card will crop to a 16:9 frame.
      </p>
      <div className="aspect-[16/9] w-full overflow-hidden rounded-md border border-slate-200 bg-slate-100">
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        <img
          src={src}
          className="h-full w-full object-cover"
          style={{ objectPosition: `${x}% ${y}%` }}
        />
      </div>
    </div>
  );
}

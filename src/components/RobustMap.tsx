import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Stage, Layer, Line, Rect, Text, Group, Circle,
  Transformer, Image as KonvaImage,
} from "react-konva";

const BG_COLOR = "#ffffff";
const NAVY = "#112e51";
const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const ZOOM_STEP = 1.15;

type DrawLine = { points: number[]; color: string; width: number };
type MapShape = {
  id: string; type: string;
  x: number; y: number; rotation: number; scaleX: number; scaleY: number;
  fill?: string; stroke?: string; strokeWidth?: number; dash?: number[];
  width?: number; height?: number; radius?: number;
};
type MapVendor = {
  id: string; original_id: string; name: string; logo_url?: string;
  x: number; y: number; rotation: number; scaleX: number; scaleY: number;
};
type HistoryEntry = { lines: DrawLine[]; vendors: MapVendor[]; shapes: MapShape[] };

const VendorPin = React.memo(function VendorPin({
  vendor, mode, readOnly, isSelected, onSelect, onTransformEnd,
}: {
  vendor: MapVendor;
  mode: string;
  readOnly: boolean;
  isSelected: boolean;
  onSelect: (e: any) => void;
  onTransformEnd: (e: any) => void;
}) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    if (vendor.logo_url) {
      const img = new window.Image();
      img.src = vendor.logo_url;
      img.crossOrigin = "Anonymous";
      img.onload = () => setImage(img);
    }
  }, [vendor.logo_url]);

  const W = image ? 70 : 130;
  const H = 60;
  const LOGO_PAD = 8;

  return (
    <Group
      id={vendor.id}
      x={vendor.x}
      y={vendor.y}
      rotation={vendor.rotation}
      scaleX={vendor.scaleX}
      scaleY={vendor.scaleY}
      draggable={!readOnly && mode === "select"}
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={onTransformEnd}
      onTransformEnd={onTransformEnd}
    >
      <Rect
        width={W} height={H}
        fill={image ? BG_COLOR : "#005ea2"}
        stroke={image ? "#e2e8f0" : undefined}
        strokeWidth={image ? 1.5 : 0}
        shadowBlur={6} shadowOpacity={0.18} shadowOffsetY={2}
        cornerRadius={6}
      />
      {image ? (
        <>
          <KonvaImage image={image} x={LOGO_PAD} y={LOGO_PAD}
            width={W - LOGO_PAD * 2} height={H - LOGO_PAD * 2 - 14} />
          <Text text={vendor.name} y={H - 14} width={W} align="center" fontSize={9} fontStyle="bold" fill="#334155" />
        </>
      ) : (
        <Text text={vendor.name} fill="white" width={W} height={H} padding={10} align="center" verticalAlign="middle" fontStyle="bold" fontSize={12} wrap="word" />
      )}
      {isSelected && <Rect width={W} height={H} stroke="#00a91c" strokeWidth={3} cornerRadius={6} listening={false} />}
    </Group>
  );
});

export default function RobustMap({
  session,
  availableVendors,
  onSave,
  readOnly = false,
}: {
  session: any;
  availableVendors: any[];
  onSave: (data: any) => void;
  readOnly?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<any>(null);
  const trRef = useRef<any>(null);

  const mapData =
    typeof session?.interactive_map_data === "string"
      ? JSON.parse(session.interactive_map_data || "{}")
      : session?.interactive_map_data || {};

  const [backgroundImage, setBackgroundImage] = useState<string | null>(
    mapData.backgroundImage ?? null,
  );
  const [bgUrlInput, setBgUrlInput] = useState<string>(mapData.backgroundImage ?? "");
  const [bgImage, setBgImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (backgroundImage) {
      const img = new window.Image();
      img.src = backgroundImage;
      img.crossOrigin = "Anonymous";
      img.onload = () => setBgImage(img);
      img.onerror = () => console.error("Failed to load map background");
    } else {
      setBgImage(null);
    }
  }, [backgroundImage]);


  const [lines, setLines] = useState<DrawLine[]>([]);
  const [shapes, setShapes] = useState<MapShape[]>([]);
  const [vendors, setVendors] = useState<MapVendor[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [mode, setMode] = useState<"select" | "draw" | "erase">("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [scale, setScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (mapData) {
      setLines(mapData.lines || []);
      setVendors(mapData.vendors || []);
      setShapes(mapData.shapes || []);
      setBackgroundImage(mapData.backgroundImage ?? null);
      setBgUrlInput(mapData.backgroundImage ?? "");
    }
    setHistory([]); setHistoryIdx(-1); setIsDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);


  const pushHistory = useCallback((l: DrawLine[], v: MapVendor[], s: MapShape[]) => {
    setHistory((prev) => {
      const next = prev.slice(0, historyIdx + 1);
      next.push({ lines: l, vendors: v, shapes: s });
      return next.slice(-40);
    });
    setHistoryIdx((prev) => Math.min(prev + 1, 39));
    setIsDirty(true);
  }, [historyIdx]);

  const removeSelected = useCallback(() => {
    if (readOnly || !selectedId) return;
    const nextV = vendors.filter((v) => v.id !== selectedId);
    const nextS = shapes.filter((s) => s.id !== selectedId);
    setVendors(nextV); setShapes(nextS); setSelectedId(null);
    pushHistory(lines, nextV, nextS);
    trRef.current?.nodes([]);
  }, [readOnly, selectedId, vendors, shapes, lines, pushHistory]);

  // Attach the Transformer to whichever item is selected so resize handles appear.
  useEffect(() => {
    const tr = trRef.current;
    const stage = stageRef.current;
    if (!tr || !stage) return;
    if (!selectedId || mode !== "select" || readOnly) {
      tr.nodes([]);
      tr.getLayer()?.batchDraw();
      return;
    }
    const node = stage.findOne(`#${selectedId}`);
    if (node) {
      tr.nodes([node]);
      tr.getLayer()?.batchDraw();
    } else {
      tr.nodes([]);
    }
  }, [selectedId, mode, readOnly, shapes, vendors, bgImage]);

  const selectedKind: "shape" | "vendor" | null = selectedId
    ? shapes.some((s) => s.id === selectedId)
      ? "shape"
      : vendors.some((v) => v.id === selectedId)
        ? "vendor"
        : null
    : null;
  const selectedScale = selectedId
    ? (selectedKind === "shape"
        ? shapes.find((s) => s.id === selectedId)?.scaleX
        : vendors.find((v) => v.id === selectedId)?.scaleX) ?? 1
    : 1;

  const setSelectedScale = useCallback(
    (next: number) => {
      if (readOnly || !selectedId || !selectedKind) return;
      const clamped = Math.max(0.2, Math.min(5, next));
      if (selectedKind === "shape") {
        const nextS = shapes.map((s) =>
          s.id === selectedId ? { ...s, scaleX: clamped, scaleY: clamped } : s,
        );
        setShapes(nextS);
        pushHistory(lines, vendors, nextS);
      } else {
        const nextV = vendors.map((v) =>
          v.id === selectedId ? { ...v, scaleX: clamped, scaleY: clamped } : v,
        );
        setVendors(nextV);
        pushHistory(lines, nextV, shapes);
      }
    },
    [readOnly, selectedId, selectedKind, shapes, vendors, lines, pushHistory],
  );


  const undo = useCallback(() => {
    if (historyIdx < 0) return;
    const entry = history[historyIdx];
    setLines(entry.lines); setVendors(entry.vendors); setShapes(entry.shapes);
    setHistoryIdx((prev) => prev - 1); setSelectedId(null);
  }, [history, historyIdx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (readOnly) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") { e.preventDefault(); undo(); }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
        removeSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, removeSelected, readOnly]);

  const handleTransformEnd = (e: any, id: string, type: "vendor" | "shape") => {
    if (readOnly) return;
    const node = e.target;
    const upd = { x: node.x(), y: node.y(), rotation: node.rotation(), scaleX: node.scaleX(), scaleY: node.scaleY() };
    let nextV = vendors; let nextS = shapes;
    if (type === "vendor") nextV = vendors.map((v) => (v.id === id ? { ...v, ...upd } : v));
    else nextS = shapes.map((s) => (s.id === id ? { ...s, ...upd } : s));
    setVendors(nextV); setShapes(nextS);
    pushHistory(lines, nextV, nextS);
  };

  const handleSave = () => {
    onSave({ lines, vendors, shapes, backgroundImage });
    setIsDirty(false);
  };

  const applyBgUrl = () => {
    const next = bgUrlInput.trim() || null;
    setBackgroundImage(next);
    setIsDirty(true);
  };
  const clearBg = () => {
    setBgUrlInput("");
    setBackgroundImage(null);
    setIsDirty(true);
  };
  const handleBgFile = (file: File) => {
    if (file.size > 2 * 1024 * 1024) {
      alert("Image is larger than 2 MB. Please host it externally and paste a URL instead.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || "");
      setBgUrlInput(url);
      setBackgroundImage(url);
      setIsDirty(true);
    };
    reader.readAsDataURL(file);
  };


  const getPointerPos = (e: any) => {
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    if (!pos) return null;
    return { x: (pos.x - stagePos.x) / scale, y: (pos.y - stagePos.y) / scale };
  };

  const checkDeselect = (e: any) => {
    if (e.target === e.target.getStage()) setSelectedId(null);
  };

  const handleStageMouseDown = (e: any) => {
    if (readOnly) return;
    if (e.evt.button === 1) {
      setIsPanning(true);
      panStart.current = { x: e.evt.clientX, y: e.evt.clientY, sx: stagePos.x, sy: stagePos.y };
      return;
    }
    if (mode === "select") { checkDeselect(e); return; }
    const pos = getPointerPos(e); if (!pos) return;
    setIsDrawing(true);
    setLines((prev) => [...prev, { points: [pos.x, pos.y], color: mode === "erase" ? BG_COLOR : NAVY, width: mode === "erase" ? 24 : 4 }]);
  };

  const handleStageMouseMove = (e: any) => {
    if (isPanning && panStart.current) {
      const dx = e.evt.clientX - panStart.current.x;
      const dy = e.evt.clientY - panStart.current.y;
      setStagePos({ x: panStart.current.sx + dx, y: panStart.current.sy + dy });
      return;
    }
    if (!isDrawing || mode === "select" || readOnly) return;
    const pos = getPointerPos(e); if (!pos) return;
    setLines((prev) => {
      const next = prev.slice();
      const last = { ...next[next.length - 1] };
      last.points = [...last.points, pos.x, pos.y];
      next[next.length - 1] = last;
      return next;
    });
  };

  const handleStageMouseUp = () => {
    if (isPanning) { setIsPanning(false); panStart.current = null; return; }
    if (!isDrawing) return;
    setIsDrawing(false);
    pushHistory(lines, vendors, shapes);
  };

  const handleWheel = (e: any) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    const oldScale = scale;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, oldScale * (e.evt.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP)));
    const mouseX = (pointer.x - stagePos.x) / oldScale;
    const mouseY = (pointer.y - stagePos.y) / oldScale;
    setScale(newScale);
    setStagePos({ x: pointer.x - mouseX * newScale, y: pointer.y - mouseY * newScale });
  };

  const zoomTo = (factor: number) => {
    const cx = dimensions.width / 2;
    const cy = dimensions.height / 2;
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
    setScale(newScale);
    setStagePos((prev) => ({
      x: cx - (cx - prev.x) * (newScale / scale),
      y: cy - (cy - prev.y) * (newScale / scale),
    }));
  };

  const resetView = () => { setScale(1); setStagePos({ x: 0, y: 0 }); };

  const handleExportMap = useCallback(() => {
    if (!stageRef.current) return;
    const prevSelected = selectedId;
    setSelectedId(null);
    setTimeout(() => {
      const dataURL = stageRef.current.toDataURL({ pixelRatio: 2, backgroundColor: BG_COLOR });
      const link = document.createElement("a");
      link.download = `Event_Floorplan_${Date.now()}.png`;
      link.href = dataURL;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      if (prevSelected) setSelectedId(prevSelected);
    }, 50);
  }, [selectedId]);

  const addShape = (type: MapShape["type"]) => {
    const id = `shape_${Date.now()}`;
    const cx = (dimensions.width / 2 - stagePos.x) / scale;
    const cy = (dimensions.height / 2 - stagePos.y) / scale;
    let s: MapShape = { id, type, x: cx - 50, y: cy - 50, rotation: 0, scaleX: 1, scaleY: 1 };
    if (type === "wall-h") s = { ...s, width: 200, height: 10, fill: "#334155" };
    if (type === "wall-v") s = { ...s, width: 10, height: 200, fill: "#334155" };
    if (type === "table") s = { ...s, radius: 40, fill: "#dbeafe", stroke: "#3b82f6", strokeWidth: 2 };
    if (type === "stage") s = { ...s, x: cx - 125, y: cy - 75, width: 250, height: 150, fill: "rgba(233,213,255,0.5)", stroke: "#6b21a8", strokeWidth: 4, dash: [10, 5] };
    const next = [...shapes, s];
    setShapes(next); pushHistory(lines, vendors, next); setMode("select"); setSelectedId(id);
  };

  const addVendor = (vendor: any) => {
    if (vendors.some((v) => v.original_id === vendor.id)) return;
    const id = `vendor_${vendor.id}`;
    const cx = (dimensions.width / 2 - stagePos.x) / scale;
    const cy = (dimensions.height / 2 - stagePos.y) / scale;
    const next = [
      ...vendors,
      {
        id, original_id: vendor.id, name: vendor.business_name,
        logo_url: vendor.logo_url, x: cx - 35, y: cy - 30,
        rotation: 0, scaleX: 1, scaleY: 1,
      },
    ];
    setVendors(next); pushHistory(lines, next, shapes); setMode("select"); setSelectedId(id);
  };

  const cursor = isPanning ? "grabbing" : readOnly ? "grab" : mode === "select" ? "default" : "crosshair";
  const placedCount = vendors.length;
  const totalCount = availableVendors?.length ?? 0;

  return (
    <div className={`flex flex-col lg:flex-row gap-6 ${readOnly ? "h-full" : "h-[700px]"}`}>
      {!readOnly && (
        <div className="w-full lg:w-80 shrink-0 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden flex flex-col">
          <div className="flex border-b border-gray-200">
            {(["select", "draw", "erase"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`flex-1 py-3 text-xs font-black uppercase tracking-widest ${mode === m ? "bg-[#112e51] text-white" : "bg-gray-50 text-muted-foreground"}`}>
                {m === "select" ? "↖ Select" : m === "draw" ? "✏ Draw" : "⌫ Erase"}
              </button>
            ))}
          </div>
          <div className="p-4 flex-1 overflow-y-auto space-y-6">
            {mode === "select" && selectedId && (
              <div className="bg-blue-50 p-3 rounded border border-blue-200 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-[#112e51]">Item selected</span>
                  <button onClick={removeSelected} className="text-[10px] bg-red-600 text-white px-3 py-1.5 rounded font-black hover:bg-red-700 uppercase tracking-widest">Delete</button>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-[#112e51]">Size</span>
                    <span className="text-[10px] font-bold text-muted-foreground">{Math.round(selectedScale * 100)}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedScale(selectedScale / 1.15)}
                      className="px-2 py-1 bg-white border border-gray-300 rounded text-sm font-black text-foreground hover:bg-gray-50"
                      title="Shrink"
                    >
                      −
                    </button>
                    <input
                      type="range"
                      min={20}
                      max={500}
                      step={5}
                      value={Math.round(selectedScale * 100)}
                      onChange={(e) => setSelectedScale(Number(e.target.value) / 100)}
                      className="flex-1 accent-[#112e51]"
                    />
                    <button
                      type="button"
                      onClick={() => setSelectedScale(selectedScale * 1.15)}
                      className="px-2 py-1 bg-white border border-gray-300 rounded text-sm font-black text-foreground hover:bg-gray-50"
                      title="Grow"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedScale(1)}
                      className="px-2 py-1 bg-white border border-gray-300 rounded text-[10px] font-black text-muted-foreground hover:bg-gray-50 uppercase"
                      title="Reset to 100%"
                    >
                      1×
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">Drag the corner handles on the canvas to free-resize.</p>
                </div>
              </div>
            )}
            {mode === "select" ? (
              <>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-2 font-black uppercase tracking-wider border-b pb-1.5">0. Background Image</p>
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={bgUrlInput}
                      onChange={(e) => setBgUrlInput(e.target.value)}
                      placeholder="Paste image URL (PNG/JPG)…"
                      className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={applyBgUrl}
                        className="p-2 border border-[#005ea2] rounded text-[10px] font-black text-[#005ea2] hover:bg-blue-50 bg-white shadow-sm uppercase tracking-wider"
                      >
                        Use URL
                      </button>
                      <label className="p-2 border border-gray-300 rounded text-[10px] font-black text-foreground hover:bg-gray-50 bg-white shadow-sm uppercase tracking-wider cursor-pointer text-center">
                        Upload
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleBgFile(f);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    </div>
                    {backgroundImage && (
                      <button
                        type="button"
                        onClick={clearBg}
                        className="w-full p-2 border border-red-200 rounded text-[10px] font-black text-red-700 hover:bg-red-50 bg-white uppercase tracking-wider"
                      >
                        Remove background
                      </button>
                    )}
                    <p className="text-[10px] text-muted-foreground leading-snug">
                      Place a venue map, blueprint, or aerial photo behind the floorplan. Files {`>`}2 MB should be hosted externally — paste the URL above.
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-2 font-black uppercase tracking-wider border-b pb-1.5">1. Architecture</p>

                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => addShape("wall-h")} className="p-2 border border-gray-300 rounded text-xs font-bold text-foreground hover:bg-gray-50 bg-white shadow-sm">Horiz. Wall</button>
                    <button onClick={() => addShape("wall-v")} className="p-2 border border-gray-300 rounded text-xs font-bold text-foreground hover:bg-gray-50 bg-white shadow-sm">Vert. Wall</button>
                    <button onClick={() => addShape("table")} className="p-2 border border-gray-300 rounded text-xs font-bold text-foreground hover:bg-gray-50 bg-white shadow-sm">Round Table</button>
                    <button onClick={() => addShape("stage")} className="p-2 border border-gray-300 rounded text-xs font-bold text-foreground hover:bg-gray-50 bg-white shadow-sm">Event Stage</button>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between items-center border-b pb-1.5 mb-2">
                    <p className="text-[10px] text-muted-foreground font-black uppercase tracking-wider">2. Place Vendors</p>
                    <span className="text-[10px] font-bold text-muted-foreground">{placedCount} / {totalCount} placed</span>
                  </div>
                  <div className="space-y-2">
                    {(!availableVendors || availableVendors.length === 0) && (
                      <p className="text-xs text-muted-foreground italic p-3 bg-gray-50 rounded border border-gray-200">No approved vendors yet.</p>
                    )}
                    {availableVendors?.map((vendor: any) => {
                      const isOnMap = vendors.some((v) => v.original_id === vendor.id);
                      return (
                        <button key={vendor.id} onClick={() => addVendor(vendor)} disabled={isOnMap} className={`w-full text-left p-3 rounded border text-xs font-bold transition-all flex items-center gap-3 ${isOnMap ? "bg-gray-50 border-gray-200 text-muted-foreground cursor-not-allowed" : "bg-white border-[#005ea2] text-[#005ea2] hover:bg-blue-50 shadow-sm"}`}>
                          {vendor.logo_url ? (
                            <img src={vendor.logo_url} className="w-8 h-8 object-contain shrink-0 rounded" alt="" />
                          ) : (
                            <div className="w-8 h-8 bg-[#005ea2] text-white rounded flex items-center justify-center font-black text-sm shrink-0">{vendor.business_name?.charAt(0)}</div>
                          )}
                          <span className="flex-1 leading-tight">
                            {vendor.business_name}
                            {isOnMap && <span className="block text-[10px] font-normal text-muted-foreground mt-0.5">Placed on map</span>}
                          </span>
                          {isOnMap && <span className="text-green-500 text-base">✓</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="text-xs text-muted-foreground p-4 bg-gray-50 rounded border border-gray-200">
                <p className="font-black mb-2 text-[#112e51] uppercase tracking-wider">{mode === "draw" ? "Drawing Mode" : "Erase Mode"}</p>
                <p className="text-muted-foreground leading-relaxed">{mode === "draw" ? "Click and drag on the canvas to draw walls, paths, or annotations." : "Click and drag over lines to erase them. Shapes and vendor pins are removed via Delete key."}</p>
                <button onClick={() => { const next: DrawLine[] = []; setLines(next); pushHistory(next, vendors, shapes); }} className="mt-4 w-full py-2 bg-red-100 text-red-700 font-black rounded hover:bg-red-200 transition-colors text-[10px] uppercase tracking-widest">Clear All Lines</button>
              </div>
            )}
          </div>
          <div className="p-3 border-t border-gray-100 bg-gray-50 text-[10px] text-muted-foreground font-medium flex justify-between">
            <span>⌘Z / Ctrl+Z to undo</span>
            <span>Del to remove selected</span>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col gap-3">
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          <button onClick={() => zoomTo(ZOOM_STEP)} className="px-3 py-1.5 bg-white border border-gray-300 rounded text-sm font-black text-foreground hover:bg-gray-50 shadow-sm">+</button>
          <button onClick={() => zoomTo(1 / ZOOM_STEP)} className="px-3 py-1.5 bg-white border border-gray-300 rounded text-sm font-black text-foreground hover:bg-gray-50 shadow-sm">−</button>
          <button onClick={resetView} className="px-3 py-1.5 bg-white border border-gray-300 rounded text-xs font-black text-muted-foreground hover:bg-gray-50 shadow-sm uppercase tracking-wider">Reset</button>
          <span className="text-xs font-bold text-muted-foreground">{Math.round(scale * 100)}%</span>
          <button onClick={handleExportMap} className="ml-auto px-4 py-1.5 bg-[#112e51] text-white rounded text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-[#1a4480]">Export PNG</button>
          {!readOnly && isDirty && (
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded uppercase tracking-wider">Unsaved changes</span>
          )}
        </div>

        <div
          ref={containerRef}
          className="flex-1 bg-white border-2 border-[#112e51] rounded-lg relative overflow-hidden shadow-inner [&_canvas]:!max-w-none"
          style={{ backgroundImage: "radial-gradient(#e2e8f0 1px, transparent 1px)", backgroundSize: "24px 24px", cursor }}
        >
          {dimensions.width > 0 && (
            <Stage
              ref={stageRef}
              width={dimensions.width}
              height={dimensions.height}
              x={stagePos.x}
              y={stagePos.y}
              scaleX={scale}
              scaleY={scale}
              onMouseDown={handleStageMouseDown}
              onMousemove={handleStageMouseMove}
              onMouseup={handleStageMouseUp}
              onWheel={handleWheel}
            >
              <Layer>
                {bgImage && <KonvaImage image={bgImage} x={0} y={0} listening={false} />}
              </Layer>
              <Layer>
                {lines.map((l, i) => (
                  <Line
                    key={i} points={l.points} stroke={l.color} strokeWidth={l.width}
                    tension={0.5} lineCap="round" lineJoin="round"
                    globalCompositeOperation={l.color === "#ffffff" ? "destination-out" : "source-over"}
                  />
                ))}
              </Layer>
              <Layer>
                {shapes.map((s) => {
                  const commonProps = {
                    id: s.id, x: s.x, y: s.y, rotation: s.rotation, scaleX: s.scaleX, scaleY: s.scaleY,
                    fill: s.fill, stroke: s.stroke, strokeWidth: s.strokeWidth, dash: s.dash,
                    draggable: !readOnly && mode === "select",
                    onClick: (e: any) => { if (!readOnly && mode === "select") { checkDeselect(e); setSelectedId(s.id); } },
                    onTap: (e: any) => { if (!readOnly && mode === "select") { checkDeselect(e); setSelectedId(s.id); } },
                    onDragEnd: (e: any) => handleTransformEnd(e, s.id, "shape"),
                    onTransformEnd: (e: any) => handleTransformEnd(e, s.id, "shape"),
                    shadowBlur: selectedId === s.id ? 8 : 3,
                    shadowOpacity: selectedId === s.id ? 0.3 : 0.1,
                    shadowOffsetY: 2,
                  };
                  if (s.type === "table") return <Circle key={s.id} {...commonProps} radius={s.radius!} />;
                  return <Rect key={s.id} {...commonProps} width={s.width!} height={s.height!} />;
                })}
                {vendors.map((v) => (
                  <VendorPin
                    key={v.id}
                    vendor={v}
                    mode={mode}
                    readOnly={readOnly}
                    isSelected={selectedId === v.id}
                    onSelect={(e: any) => { if (!readOnly && mode === "select") { checkDeselect(e); setSelectedId(v.id); } }}
                    onTransformEnd={(e: any) => handleTransformEnd(e, v.id, "vendor")}
                  />
                ))}
                {!readOnly && mode === "select" && (
                  <Transformer
                    ref={trRef}
                    rotateEnabled
                    keepRatio={false}
                    anchorSize={10}
                    anchorStroke="#112e51"
                    anchorFill="#ffffff"
                    borderStroke="#112e51"
                    borderDash={[4, 4]}
                    enabledAnchors={[
                      "top-left", "top-right", "bottom-left", "bottom-right",
                      "middle-left", "middle-right", "top-center", "bottom-center",
                    ]}
                    boundBoxFunc={(oldBox, newBox) => (newBox.width < 20 || newBox.height < 20 ? oldBox : newBox)}
                  />
                )}
              </Layer>
            </Stage>
          )}
        </div>

        {!readOnly && (
          <div className="flex justify-between items-center shrink-0">
            <p className="text-xs text-muted-foreground font-medium">Scroll to zoom · Middle-click drag to pan · ⌘Z to undo</p>
            <button onClick={handleSave} disabled={!isDirty} className="bg-[#00a91c] hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-black py-2.5 px-8 rounded transition-all shadow-md uppercase tracking-widest text-xs">
              {isDirty ? "Save Blueprint" : "Blueprint Saved ✓"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

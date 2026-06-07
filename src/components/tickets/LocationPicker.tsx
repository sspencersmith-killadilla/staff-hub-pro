import { useEffect, useRef, useState } from "react";
import { MapPin, Loader2, Locate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useServerFn } from "@tanstack/react-start";
import { reverseGeocode, geocodeAddress } from "@/lib/tickets.functions";
import { toast } from "sonner";

type Coords = { lat: number; lng: number } | null;

let mapsLoading: Promise<void> | null = null;
function loadMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  // @ts-ignore
  if (window.google?.maps) return Promise.resolve();
  if (mapsLoading) return mapsLoading;
  mapsLoading = new Promise((resolve, reject) => {
    const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
    const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
    if (!key) {
      reject(new Error("Google Maps key missing"));
      return;
    }
    (window as any).__initLovableMaps = () => resolve();
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&callback=__initLovableMaps${
      channel ? `&channel=${channel}` : ""
    }`;
    s.async = true;
    s.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(s);
  });
  return mapsLoading;
}

export function LocationPicker({
  address,
  coords,
  onChange,
}: {
  address: string;
  coords: Coords;
  onChange: (next: { address: string; coords: Coords }) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInst = useRef<any>(null);
  const markerInst = useRef<any>(null);
  const [loading, setLoading] = useState(false);
  const reverse = useServerFn(reverseGeocode);
  const geocode = useServerFn(geocodeAddress);

  useEffect(() => {
    let cancelled = false;
    loadMaps()
      .then(() => {
        if (cancelled || !mapRef.current) return;
        // @ts-ignore
        const g = (window as any).google;
        const center = coords ?? { lat: 39.5, lng: -98.35 };
        mapInst.current = new g.maps.Map(mapRef.current, {
          center,
          zoom: coords ? 16 : 4,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        markerInst.current = new g.maps.Marker({
          map: coords ? mapInst.current : null,
          position: center,
          draggable: true,
        });
        markerInst.current.addListener("dragend", async () => {
          const pos = markerInst.current.getPosition();
          const next = { lat: pos.lat(), lng: pos.lng() };
          const { address: addr } = await reverse({ data: { latitude: next.lat, longitude: next.lng } });
          onChange({ address: addr ?? address, coords: next });
        });
        mapInst.current.addListener("click", async (e: any) => {
          const next = { lat: e.latLng.lat(), lng: e.latLng.lng() };
          markerInst.current.setPosition(next);
          markerInst.current.setMap(mapInst.current);
          const { address: addr } = await reverse({ data: { latitude: next.lat, longitude: next.lng } });
          onChange({ address: addr ?? address, coords: next });
        });
      })
      .catch((err) => toast.error(err.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapInst.current || !markerInst.current) return;
    if (coords) {
      markerInst.current.setPosition(coords);
      markerInst.current.setMap(mapInst.current);
      mapInst.current.panTo(coords);
      if (mapInst.current.getZoom() < 14) mapInst.current.setZoom(16);
    }
  }, [coords?.lat, coords?.lng]);

  const useMyLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation not supported on this device");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        try {
          const { address: addr } = await reverse({
            data: { latitude: next.lat, longitude: next.lng },
          });
          onChange({ address: addr ?? "", coords: next });
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        setLoading(false);
        toast.error(err.message || "Could not get your location");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const lookupAddress = async () => {
    if (!address || address.length < 3) return;
    setLoading(true);
    try {
      const res = await geocode({ data: { address } });
      if (res.latitude != null && res.longitude != null) {
        onChange({
          address: res.address ?? address,
          coords: { lat: res.latitude, lng: res.longitude },
        });
      } else {
        toast.error("No match for that address");
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={address}
          onChange={(e) => onChange({ address: e.target.value, coords })}
          placeholder="Street address or intersection"
          onBlur={lookupAddress}
        />
        <Button type="button" variant="outline" onClick={useMyLocation} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Locate className="h-4 w-4" />}
          <span className="ml-1 hidden sm:inline">Use my location</span>
        </Button>
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <MapPin className="h-3 w-3" />
        {coords ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}` : "Tap the map or pick your location"}
      </div>
      <div ref={mapRef} className="h-64 w-full rounded-lg border bg-slate-100" />
    </div>
  );
}

"use client";
import { useEffect, useRef } from "react";

// Snazzy Maps "Subtle Grayscale" (Paulo Avila). Swap this array for any other Snazzy Maps style JSON.
const STYLE = [{ featureType: "landscape", stylers: [{ saturation: -100 }, { lightness: 65 }, { visibility: "on" }] }, { featureType: "poi", stylers: [{ saturation: -100 }, { lightness: 51 }, { visibility: "simplified" }] }, { featureType: "road.highway", stylers: [{ saturation: -100 }, { visibility: "simplified" }] }, { featureType: "road.arterial", stylers: [{ saturation: -100 }, { lightness: 30 }, { visibility: "on" }] }, { featureType: "road.local", stylers: [{ saturation: -100 }, { lightness: 40 }, { visibility: "on" }] }, { featureType: "transit", stylers: [{ saturation: -100 }, { visibility: "simplified" }] }, { featureType: "administrative.province", stylers: [{ visibility: "off" }] }, { featureType: "water", elementType: "labels", stylers: [{ visibility: "on" }, { lightness: -25 }, { saturation: -100 }] }, { featureType: "water", elementType: "geometry", stylers: [{ hue: "#ffff00" }, { lightness: -25 }, { saturation: -97 }] }];

let loading: Promise<void> | undefined;
const load = (key: string) => (loading ??= new Promise<void>((ok, no) => {
  const s = document.createElement("script");
  s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}`;
  s.async = true; s.onload = () => ok(); s.onerror = () => { loading = undefined; no(new Error("Google Maps failed to load")); };
  document.head.appendChild(s);
}));

/** A grayscale Google map centred (with a pin) on `address`. Renders nothing without a key. `backdrop` makes it a pale, non-interactive full-page background behind the content. */
export default function StyledMap({ apiKey, address, backdrop = false }: { apiKey: string; address: string; backdrop?: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!apiKey || !address) return;
    let off = false;
    load(apiKey).then(() => {
      const g = (window as any).google.maps;
      new g.Geocoder().geocode({ address }, (r: any, status: string) => {
        if (off || status !== "OK" || !el.current) return;
        const at = r[0].geometry.location;
        const map = new g.Map(el.current, { center: at, zoom: backdrop ? 15 : 16, styles: STYLE, disableDefaultUI: backdrop, gestureHandling: backdrop ? "none" : "cooperative", clickableIcons: !backdrop });
        new g.Marker({ map, position: at, title: address });
      });
    }).catch(() => {});
    return () => { off = true; };
  }, [apiKey, address, backdrop]);
  if (!apiKey) return null;
  // Backdrop: fixed behind everything, faded so text on top stays readable, and never catches clicks.
  return <div ref={el} aria-hidden={backdrop} style={backdrop ? { position: "fixed", inset: 0, zIndex: -1, opacity: 0.35, pointerEvents: "none" } : { width: "100%", height: "100vh" }} />;
}

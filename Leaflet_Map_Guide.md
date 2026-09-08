# CommuniShield — Leaflet That Works on BOTH Web and Mobile (JSX Only)

The old guide said "Leaflet only works on web." That's only half-true:

> **Leaflet works on mobile.** It is a JavaScript/DOM library, so it runs
> anywhere an HTML page can render — that includes **mobile browsers** and the
> **WebView** embedded inside a native Android/iOS app.

The one real limitation: Leaflet **cannot render as a native React Native view**
(you can't put it inside a `<View>` on Android/iOS). On native, it must be hosted
inside a `react-native-webview` — which is just a mini browser window.

**This version needs no separate `.html` file.** The entire map page is a plain
string embedded in `MapView.jsx`, so both the web build and the native app load
the exact same map from one JSX file.

| Target             | How the map renders                              |
| ------------------ | ------------------------------------------------ |
| Web (`expo web`)   | `<iframe srcDoc={mapHtml}>` — HTML string inline |
| Android / iOS app  | `<WebView source={{ html: mapHtml }}>`           |
| Phone browser      | Open the web build URL on the phone — works as-is, no extra code |

---

## The plan

1. `MapView.jsx` holds one constant: the full Leaflet HTML page (as a string).
2. It renders that string in an `<iframe>` on **web** and a `<WebView>` on
   **native** — same tiles, same markers, same "follow the user" logic.
3. `User_Map.jsx` sends the user's location + facility markers into the map and
   reacts to marker taps, all through a tiny message bridge.

---

## Step 1 — Install the native WebView

In `clients/`:

```bash
npx expo install react-native-webview
```

> `leaflet` and `react-leaflet` are **not needed** — Leaflet loads from a CDN
> inside the embedded HTML string.

---

## Step 2 — Rewrite `MapView.jsx` (everything lives here)

Replace `clients/components/MapView.jsx` with:

```jsx
import React, { useRef, useCallback } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

// The whole Leaflet map, as an HTML string. Used by BOTH the web iframe
// (srcDoc) and the native WebView (source.html). No .html file needed.
const MAP_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>html, body, #map { margin: 0; height: 100%; }</style>
</head>
<body>
  <div id="map"></div>
  <script>
    function sendToHost(msg) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      } else if (window.parent) {
        window.parent.postMessage(JSON.stringify(msg), "*");
      }
    }

    // Default center: Argao, Cebu
    const map = L.map("map", { center: [9.8816, 123.5953], zoom: 13 });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    let userMarker = L.marker([9.8816, 123.5953]).addTo(map);
    userMarker.bindPopup("Your current location");
    let follow = true;

    // Called from the app to set position + markers.
    window.__communishieldInit = function (cfg) {
      const c = cfg || {};
      if (c.lat !== undefined && c.lng !== undefined) {
        userMarker.setLatLng([c.lat, c.lng]);
        map.setView([c.lat, c.lng], 15);
        sendToHost({ type: "location", lat: c.lat, lng: c.lng });
      }
      if (c.markers) {
        c.markers.forEach((m) => {
          const marker = L.marker([m.lat, m.lng]).addTo(map);
          marker.bindPopup(m.label || m.name || "");
          marker.on("click", () => sendToHost({ type: "markerPress", id: m.id }));
        });
      }
    };

    // Re-center from the app's button.
    window.__communishieldRecenter = function (lat, lng) {
      follow = true;
      if (lat !== undefined && lng !== undefined) userMarker.setLatLng([lat, lng]);
      map.setView([lat, lng], 15);
    };

    // Web iframe sends data via postMessage.
    window.addEventListener("message", (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d.type === "init") window.__communishieldInit(d);
        if (d.type === "recenter") window.__communishieldRecenter(d.lat, d.lng);
        if (d.type === "setFollow") follow = !!d.follow;
      } catch (_) {}
    });

    // User drags the map -> stop following.
    map.on("dragstart", () => { follow = false; });

    // Browser GPS (web). On native the app injects position via __communishieldInit.
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => { userMarker.setLatLng([p.coords.latitude, p.coords.longitude]); if (follow) map.setView([p.coords.latitude, p.coords.longitude], 15); },
        () => {},
        { enableHighAccuracy: true, timeout: 10000 }
      );
      navigator.geolocation.watchPosition(
        (p) => { userMarker.setLatLng([p.coords.latitude, p.coords.longitude]); if (follow) map.setView([p.coords.latitude, p.coords.longitude], 15); },
        () => {},
        { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
      );
    }
  <\/script>
</body>
</html>
`;

const MapView = React.forwardRef(({ position, markers = [], onMarkerPress, onLocation }, ref) => {
  const mapRef = useRef(null);

  // Data we want to push into the map.
  const buildConfig = useCallback(
    () => ({
      type: "init",
      lat: position?.[0],
      lng: position?.[1],
      markers: markers.map((m) => ({
        id: m.id,
        lat: m.lat,
        lng: m.lng,
        label: m.label,
      })),
    }),
    [position, markers]
  );

  const pushInit = useCallback(() => {
    if (!mapRef.current) return;
    const cfg = JSON.stringify(buildConfig());
    if (Platform.OS === "web") {
      mapRef.current.contentWindow?.postMessage(cfg, "*");
    } else {
      mapRef.current.injectJavaScript(
        `window.__communishieldInit && window.__communishieldInit(${cfg}); true;`
      );
    }
  }, [buildConfig]);

  const recenter = useCallback(() => {
    if (!position || !mapRef.current) return;
    if (Platform.OS === "web") {
      mapRef.current.contentWindow?.postMessage(
        JSON.stringify({ type: "recenter", lat: position[0], lng: position[1] }),
        "*"
      );
    } else {
      mapRef.current.injectJavaScript(
        `window.__communishieldRecenter && window.__communishieldRecenter(${position[0]}, ${position[1]}); true;`
      );
    }
  }, [position]);

  // Expose recenter() so User_Map.jsx can call it via a ref.
  React.useImperativeHandle(ref, () => ({ recenter }));

  const onMessage = useCallback(
    (e) => {
      try {
        const data = JSON.parse(e.nativeEvent?.data ?? e.data);
        if (data.type === "markerPress") onMarkerPress?.(data.id);
        if (data.type === "location") onLocation?.([data.lat, data.lng]);
      } catch (_) {}
    },
    [onMarkerPress, onLocation]
  );

  if (Platform.OS === "web") {
    return (
      <iframe
        ref={mapRef}
        srcDoc={MAP_HTML}
        style={{ width: "100%", height: "100%", borderWidth: 0 }}
        onLoad={() => pushInit()}
      />
    );
  }

  return (
    <View style={styles.map}>
      <WebView
        ref={mapRef}
        source={{ html: MAP_HTML }}
        style={styles.map}
        onMessage={onMessage}
        onLoadEnd={pushInit}
        geolocationEnabled={true}
        javaScriptEnabled={true}
        originWhitelist={["*"]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  map: {
    width: "100%",
    height: "100%",
  },
});

export default MapView;
```

What this does:

- `MAP_HTML` is the whole Leaflet page as a string — no `.html` file anywhere.
- The page exposes `window.__communishieldInit(cfg)` and `window.__communishieldRecenter(lat, lng)`.
- **Native** calls those via `injectJavaScript` (WebView) and gets events back via
  `onMessage`.
- **Web** calls them via `postMessage` on the iframe's `contentWindow` and gets
  events back via the `message` listener + `sendToHost`.
- Browser GPS inside the page powers the web "follow"; on native, the app injects
  the position from `expo-location`.

> **Lat/Lng order:** Leaflet is **latitude-first** (`[lat, lng]`). Your reports
> store `latitude` and `longitude` separately — keep them in that order.
>
> Note: the `<\/script>` in the JSX is a template-literal escape so the closing
> tag inside the string doesn't terminate the template.

---

## Step 3 — Wire up `User_Map.jsx`

Open `clients/app/(tabs)/User_Map.jsx`:

1. **Add state + a ref for the map:**

```jsx
const mapViewRef = useRef(null);
const [userPosition, setUserPosition] = useState(null);
```

2. **Request location permission on native** (web falls back to the browser GPS
   inside the map page):

```jsx
useEffect(() => {
  let cancelled = false;

  const requestLocation = async () => {
    if (Platform.OS === "web") return; // HTML handles browser GPS
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      if (!cancelled) {
        setUserPosition([current.coords.latitude, current.coords.longitude]);
      }
    } catch (err) {
      console.warn("Location error:", err.message);
    }
  };

  requestLocation();
  return () => {
    cancelled = true;
  };
}, []);
```

> Add `import * as Location from "expo-location";` and make sure `Platform` is
> imported from `react-native`. This mirrors the pattern already used in
> `User_PostReport.jsx`.

3. **Give every facility real coordinates** (replace the fake `top`/`left` with
   `lat`/`lng`):

```jsx
const EMERGENCY_FACILITIES = [
  {
    id: 1,
    type: "Police Station",
    name: "Argao Municipal Police Station",
    location: "Poblacion, Argao",
    contact: "911 / Local Police Hotline",
    lat: 9.8767,
    lng: 123.5989,
  },
  // ...add lat/lng to the other 3 entries
];
```

4. **Render the real map** (replace the placeholder `<MapView style={styles.map} />`):

```jsx
<MapView
  ref={mapViewRef}
  style={styles.map}
  position={userPosition}
  markers={filteredFacilities.map((f) => ({
    id: f.id,
    lat: f.lat,
    lng: f.lng,
    label: f.name,
  }))}
  onMarkerPress={(id) => {
    const facility = EMERGENCY_FACILITIES.find((f) => f.id === id);
    if (facility) setSelectedFacility(facility);
  }}
  onLocation={setUserPosition}
/>
```

5. **Remove the fake overlays** — the hard-coded `<View style={styles.userLocation}>`
   dot and `<View style={styles.userBadge}>` "You" label no longer align with the
   real map. Delete them (Leaflet draws the real user marker now).

6. **Re-center button:**

```jsx
<TouchableOpacity
  style={styles.recenterButton}
  onPress={() => mapViewRef.current?.recenter()}
>
  <Ionicons name="locate-outline" size={20} color="#FFFFFF" />
</TouchableOpacity>
```

The facility card, search bar, filter modal, legend, and bottom summary stay as
React Native UI floating on top of the map — they work identically on both
platforms.

---

## Step 4 — Run it

```bash
cd clients
npx expo start --web      # test web + open the URL on your phone
# and on the device / emulator:
npx expo start
```

Verify:

1. Web: map loads, browser asks for location, user marker appears, map follows.
2. Phone browser: open the web URL → same experience, no extra code.
3. Native: `react-native-webview` opens, location permission prompt appears, and
   the map follows the user.
4. Tapping a facility marker opens the facility card in `User_Map.jsx`.
5. Re-center button brings the map back to the user.

---

## Pitfalls specific to this approach

- **`react-native-webview` needs a native rebuild.** After `npx expo install
  react-native-webview`, run the app fresh (`npx expo start` then press `a`/`i`).
- **`<\/script>` escape:** inside the JSX template literal you must write the
  closing script tag as `<\/script>`, or it will break the JSX string.
- **WebView location:** keep `geolocationEnabled` + `javaScriptEnabled` on, or
  pass `lat`/`lng` from `expo-location` (Step 3) instead.
- **Events arrive after the map loads:** call `pushInit` on `onLoad` / `onLoadEnd`
  so the app's data reaches the map once the page is ready.
- **Coordinate order:** always `[latitude, longitude]`. Swap them and the map
  centers in the wrong ocean.
- **Grey map:** the CDN script must load; if offline, the tiles (and map) won't
  render. Consider bundling Leaflet locally for production.
- **Web iframe + `<div>` parents:** keep the `iframe` inside a container with an
  explicit height (`style={styles.map}`), otherwise it collapses to 0px.

---

## Checklist

1. `npx expo install react-native-webview`.
2. `MapView.jsx` contains the `MAP_HTML` string + `<iframe>`/`<WebView>` render.
3. `User_Map.jsx` passes real `lat`/`lng` + markers, listens for `markerPress`.
4. Fake `top`/`left` dots removed; re-center button wired to `recenter()`.
5. Tested on `expo web` + a phone browser + a native build.
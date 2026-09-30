import React, {
  useRef,
  useEffect,
  useCallback,
  useState,
} from "react";
import { Platform, StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

const MAP_HTML = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
html,body,#map{margin:0;padding:0;height:100%;width:100%;}
body{background:#DCE7F3;}
.cs-pin-wrap{background:none!important;border:none!important;}
.cs-pin{position:relative;width:28px;height:40px;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.45));}
.cs-cap{display:none;position:absolute;top:41px;left:50%;transform:translateX(-50%);font:600 10px/1.25 Arial,Helvetica,sans-serif;color:#1F2937;background:rgba(255,255,255,0.92);padding:1px 6px;border:1px solid rgba(0,0,0,0.14);border-radius:7px;white-space:nowrap;pointer-events:none;}
#map.cs-caps .cs-cap{display:block;}
</style>
</head>
<body>
<div id="map"></div>
<script>
  (function () {
    function sendToHost(msg) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify(msg));
      } else if (window.parent && window.parent !== window) {
        window.parent.postMessage(JSON.stringify(msg), "*");
      }
    }

    var CEBU_LAT_MIN = 9.45;
    var CEBU_LAT_MAX = 11.45;
    var CEBU_LNG_MIN = 123.05;
    var CEBU_LNG_MAX = 124.05;

    function clampLat(x) {
      return Math.min(Math.max(x, CEBU_LAT_MIN), CEBU_LAT_MAX);
    }
    function clampLng(x) {
      return Math.min(Math.max(x, CEBU_LNG_MIN), CEBU_LNG_MAX);
    }

    var map = L.map("map", {
      center: [9.8816, 123.5953],
      zoom: 13,
      minZoom: 9,
      scrollWheelZoom: true,
      zoomControl: true,
      zoomSnap: 0.5,
      zoomDelta: 0.5,
      wheelDebounceTime: 40,
      wheelPxPerZoomLevel: 40,
      smooth: true,
      inertia: true,
      inertiaDeceleration: 2000,
      inertiaMaxSpeed: 3000,
      maxBounds: [
        [CEBU_LAT_MIN, CEBU_LNG_MIN],
        [CEBU_LAT_MAX, CEBU_LNG_MAX],
      ],
      maxBoundsViscosity: 0.6,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    var userMarker = L.marker([9.8816, 123.5953]).addTo(map);
    userMarker.bindPopup("Your current location");

    var facilityLayer = L.layerGroup().addTo(map);
    var follow = true;
    var lastSent = null;
    var inited = false;

    var PIN_COLORS = {
      barangay: "#2E7D32",
      hospital: "#D32F2F",
      clinic: "#00897B",
      police: "#294880",
      fire: "#F4511E",
      help: "#7B1FA2",
    };
    var PIN_GLYPHS = {
      police: '<path d="M8 0.6 14 3v5c0 3.4-2.4 6.2-6 7.4C4.4 14.2 2 11.4 2 8V3L8 0.6z" fill="#fff"/>',
      fire: '<path d="M9.4 0.5c.7 2.1-1.5 3.3-1.5 5.4 0 1 .6 1.9 1.6 2.3-.4-1 .1-2.1.9-2.9.4 1.5 2.6 2.4 2.6 4.8 0 2.1-1.7 3.8-3.8 3.8S5.4 12.2 5.4 10c0-3.8 3.4-5.7 4-9.5z" fill="#fff"/>',
      hospital: '<path d="M6.2 1.5h3.6v4.7h4.7v3.6H9.8v4.7H6.2V9.8H1.5V6.2h4.7V1.5z" fill="#fff"/>',
      clinic: '<circle cx="8" cy="8" r="6.2" fill="none" stroke="#fff" stroke-width="1.8"/><path d="M7.1 4.6h1.8V7h2.4v1.8H8.9v2.4H7.1V8.8H4.7V7h2.4V4.6z" fill="#fff"/>',
      barangay: '<path d="M8 1.2 1.2 7.2h2.1v6.6h9.4V7.2h2.1L8 1.2z" fill="#fff"/>',
      help: '<circle cx="8" cy="8" r="6.2" fill="none" stroke="#fff" stroke-width="1.9"/><circle cx="8" cy="8" r="2.1" fill="#fff"/><path d="M8 1.8v2.4M8 11.8v2.4M1.8 8h2.4M11.8 8h2.4" stroke="#fff" stroke-width="1.7"/>',
    };
    PIN_GLYPHS._default = '<circle cx="8" cy="8" r="4" fill="#fff"/>';

    function esc(s) {
      return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function pinHtml(m) {
      var color = m.color || PIN_COLORS[m.type] || "#294880";
      var glyph = PIN_GLYPHS[m.type] || PIN_GLYPHS._default;
      var cap =
        m.type === "barangay" && m.label
          ? '<div class="cs-cap">' + esc(m.label) + "</div>"
          : "";
      return (
        '<div class="cs-pin"><svg width="28" height="40" viewBox="0 0 28 40" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M14 1.2C8 1.2 3.2 6 3.2 12c0 5.5 4.3 12 7.8 17.5L14 36.8l3-7.3c3.5-5.5 7.8-12 7.8-17.5C24.8 6 20 1.2 14 1.2z" fill="' +
        color +
        '" stroke="#FFFFFF" stroke-width="1.6" stroke-linejoin="round"/>' +
        '<g transform="translate(6,6.4)">' +
        glyph +
        "</g></svg>" +
        cap +
        "</div>"
      );
    }

    function updateCaps() {
      var el = document.getElementById("map");
      if (!el) return;
      if (map.getZoom() >= 14) el.classList.add("cs-caps");
      else el.classList.remove("cs-caps");
    }
    map.on("zoomend", updateCaps);

    function setInteractive(flag) {
      [
        "dragging",
        "scrollWheelZoom",
        "touchZoom",
        "doubleClickZoom",
        "boxZoom",
        "keyboard",
      ].forEach(function (key) {
        var handler = map[key];
        if (!handler) return;
        flag ? handler.enable() : handler.disable();
      });
    }

    function positionToHost(lat, lng) {
      if (lastSent && lastSent[0] === lat && lastSent[1] === lng) return;
      lastSent = [lat, lng];
      sendToHost({ type: "location", lat: lat, lng: lng });
    }

    window.__communishieldInit = function (cfg) {
      var c = cfg || {};
      setInteractive(c.interactive !== false);
      facilityLayer.clearLayers();
      (c.markers || []).forEach(function (m) {
        var mark = L.marker([m.lat, m.lng], {
          icon: L.divIcon({
            className: "cs-pin-wrap",
            html: pinHtml(m),
            iconSize: [28, 40],
            iconAnchor: [14, 37],
          }),
          riseOnHover: true,
        }).addTo(facilityLayer);
        mark.bindPopup(esc(m.label || "Location"));
        mark.on("click", function () {
          sendToHost({ type: "markerPress", id: m.id });
        });
      });
      if (c.lat !== undefined && c.lng !== undefined) {
        var clat = clampLat(c.lat);
        var clng = clampLng(c.lng);
        userMarker.setLatLng([clat, clng]);
        if (!inited) {
          map.setView([clat, clng], 15);
          inited = true;
        }
        positionToHost(clat, clng);
      }
    };

    window.__communishieldRecenter = function (lat, lng) {
      follow = true;
      if (lat !== undefined && lng !== undefined) {
        var clat = clampLat(lat);
        var clng = clampLng(lng);
        userMarker.setLatLng([clat, clng]);
        positionToHost(clat, clng);
        map.setView([clat, clng], 15);
      }
    };

    window.__communishieldSetUser = function (lat, lng) {
      var clat = clampLat(lat);
      var clng = clampLng(lng);
      userMarker.setLatLng([clat, clng]);
    };

    window.addEventListener("message", function (e) {
      try {
        var d = JSON.parse(e.data);
        if (d.type === "init") window.__communishieldInit(d);
        else if (d.type === "recenter") window.__communishieldRecenter(d.lat, d.lng);
        else if (d.type === "setFollow") follow = !!d.follow;
        else if (d.type === "user") window.__communishieldSetUser(d.lat, d.lng);
      } catch (err) {}
    });

    map.on("dragstart", function () {
      follow = false;
    });

    map.on("click", function () {
      sendToHost({ type: "mapPress" });
    });

    if (navigator.geolocation) {
      function report(p) {
        var lat = clampLat(p.coords.latitude);
        var lng = clampLng(p.coords.longitude);
        userMarker.setLatLng([lat, lng]);
        if (follow) map.setView([lat, lng], 15);
        if (follow) positionToHost(lat, lng);
      }
      navigator.geolocation.getCurrentPosition(report, function () {}, {
        enableHighAccuracy: true,
        timeout: 10000,
      });
      navigator.geolocation.watchPosition(report, function () {}, {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 15000,
      });
    }
  })();
</script>
</body>
</html>
`;

const IFRAME_STYLE = {
  width: "100%",
  height: "100%",
  border: "0",
  display: "block",
};

const MapView = React.forwardRef(
  (
    {
      style,
      position = null,
      markers = [],
      interactive = true,
      onMarkerPress,
      onMapPress,
      onLocation,
    },
    ref
  ) => {
    const mapRef = useRef(null);
    const [loaded, setLoaded] = useState(false);
    const isWeb = Platform.OS === "web";

    const positionRef = useRef(position);
    positionRef.current = position;

    const pushInit = useCallback(() => {
      if (!mapRef.current) return;
      const pos = positionRef.current;
      const cfg = JSON.stringify({
        type: "init",
        interactive,
        lat: pos ? pos[0] : undefined,
        lng: pos ? pos[1] : undefined,
        markers: markers.map((m) => ({
          id: m.id,
          lat: m.lat,
          lng: m.lng,
          label: m.label,
          color: m.color,
          type: m.type,
        })),
      });
      if (isWeb) {
        mapRef.current.contentWindow?.postMessage(cfg, "*");
      } else {
        mapRef.current.injectJavaScript(
          `window.__communishieldInit && window.__communishieldInit(${cfg}); true;`
        );
      }
    }, [interactive, markers, isWeb]);

    const pushUser = useCallback(() => {
      if (!mapRef.current || !position) return;
      if (isWeb) {
        mapRef.current.contentWindow?.postMessage(
          JSON.stringify({
            type: "user",
            lat: position[0],
            lng: position[1],
          }),
          "*"
        );
      } else {
        mapRef.current.injectJavaScript(
          `window.__communishieldSetUser && window.__communishieldSetUser(${position[0]}, ${position[1]}); true;`
        );
      }
    }, [position, isWeb]);

    const recenter = useCallback(() => {
      if (!mapRef.current || !position) return;
      if (isWeb) {
        mapRef.current.contentWindow?.postMessage(
          JSON.stringify({
            type: "recenter",
            lat: position[0],
            lng: position[1],
          }),
          "*"
        );
      } else {
        mapRef.current.injectJavaScript(
          `window.__communishieldRecenter && window.__communishieldRecenter(${position[0]}, ${position[1]}); true;`
        );
      }
    }, [position, isWeb]);

    useEffect(() => {
      if (!loaded) return;
      pushInit();
    }, [loaded, pushInit]);

    useEffect(() => {
      if (!loaded || !position) return;
      pushUser();
    }, [loaded, position, pushUser]);

    useEffect(() => {
      if (!isWeb) return undefined;
      const handler = (e) => {
        if (
          mapRef.current &&
          e.source &&
          e.source !== mapRef.current.contentWindow
        ) {
          return;
        }
        try {
          const data = JSON.parse(e.data);
          if (data.type === "markerPress") onMarkerPress?.(data.id);
          if (data.type === "mapPress") onMapPress?.();
          if (data.type === "location") onLocation?.([data.lat, data.lng]);
        } catch {}
      };
      window.addEventListener("message", handler);
      return () => window.removeEventListener("message", handler);
    }, [isWeb, onMarkerPress, onMapPress, onLocation]);

    React.useImperativeHandle(ref, () => ({ recenter }));

    if (isWeb) {
      return (
        <iframe
          ref={mapRef}
          srcDoc={MAP_HTML}
          style={{ ...IFRAME_STYLE, ...(style || {}) }}
          onLoad={() => setLoaded(true)}
        />
      );
    }

    return (
      <View style={[styles.fill, style]}>
        <WebView
          ref={mapRef}
          source={{ html: MAP_HTML }}
          style={styles.fill}
          onMessage={(e) => {
            try {
              const data = JSON.parse(e.nativeEvent?.data);
              if (data.type === "markerPress") onMarkerPress?.(data.id);
              if (data.type === "mapPress") onMapPress?.();
              if (data.type === "location") onLocation?.([data.lat, data.lng]);
            } catch {}
          }}
          onLoadEnd={() => setLoaded(true)}
          geolocationEnabled
          javaScriptEnabled
          originWhitelist={["*"]}
        />
      </View>
    );
  }
);

const styles = StyleSheet.create({
  fill: {
    width: "100%",
    height: "100%",
  },
});

export default MapView;

MapView.displayName = "MapView";
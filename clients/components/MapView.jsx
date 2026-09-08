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
<style>html,body,#map{margin:0;padding:0;height:100%;width:100%;}body{background:#DCE7F3;}</style>
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
      scrollWheelZoom: false,
      maxBounds: [
        [CEBU_LAT_MIN, CEBU_LNG_MIN],
        [CEBU_LAT_MAX, CEBU_LNG_MAX],
      ],
      maxBoundsViscosity: 1.0,
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
        var mark = L.circleMarker([m.lat, m.lng], {
          radius: 10,
          color: "#FFFFFF",
          weight: 2,
          fillColor: m.color || "#294880",
          fillOpacity: 0.85,
        }).addTo(facilityLayer);
        mark.bindPopup(m.label || "Location");
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
          if (data.type === "location") onLocation?.([data.lat, data.lng]);
        } catch {}
      };
      window.addEventListener("message", handler);
      return () => window.removeEventListener("message", handler);
    }, [isWeb, onMarkerPress, onLocation]);

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
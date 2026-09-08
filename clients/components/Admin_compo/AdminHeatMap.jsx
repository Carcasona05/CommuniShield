import React, { useEffect, useRef, useState } from "react";
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
<script src="https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js"></script>
<style>
  html,body,#map{margin:0;padding:0;height:100%;width:100%;}
  body{background:#DCE7F3;}
</style>
</head>
<body>
<div id="map"></div>
<script>
  (function () {
    var ARGAO_CENTER = [9.8816, 123.5953];
    var ARGAO_BOUNDS = [
      [9.75, 123.5],
      [9.95, 123.65],
    ];

    var map = L.map("map", {
      center: ARGAO_CENTER,
      zoom: 13,
      minZoom: 12,
      maxZoom: 18,
      maxBounds: ARGAO_BOUNDS,
      maxBoundsViscosity: 1.0,
      scrollWheelZoom: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    L.control.scale().addTo(map);

    var SEVERITY_COLOR = {
      Low: "#3DBB74",
      Medium: "#F7C948",
      High: "#F29A2E",
      Critical: "#E45757",
    };

    var SEVERITY_INTENSITY = { Low: 0.3, Medium: 0.5, High: 0.75, Critical: 1 };

    var HEAT_GRADIENT = {
      0.3: "#22c55e",
      0.5: "#eab308",
      0.75: "#f97316",
      1: "#ef4444",
    };

    function severityOf(r) {
      return SEVERITY_INTENSITY[r.severity] != null ? r.severity : "Medium";
    }

    var markerLayer = L.layerGroup().addTo(map);
    var heatLayer = null;

    function render(list) {
      markerLayer.clearLayers();
      if (heatLayer) {
        map.removeLayer(heatLayer);
        heatLayer = null;
      }

      var points = [];

      (list || []).forEach(function (r) {
        if (r.latitude == null || r.longitude == null) return;
        var lat = Number(r.latitude);
        var lng = Number(r.longitude);
        if (!isFinite(lat) || !isFinite(lng)) return;

        var sev = severityOf(r);
        points.push([lat, lng, SEVERITY_INTENSITY[sev]]);

        var marker = L.circleMarker([lat, lng], {
          radius: 8,
          color: "#FFFFFF",
          weight: 2,
          fillColor: SEVERITY_COLOR[sev] || "#294880",
          fillOpacity: 0.9,
        });

        var score = r.ai_score != null ? r.ai_score + "%" : "\u2014";
        marker.bindPopup(
          "<b>" + (r.incident_type || "Incident") + "</b><br/>" +
            (r.location || "") +
            "<br/>Severity: " + (r.severity || "Medium") +
            "<br/>AI Score: " + score
        );

        markerLayer.addLayer(marker);
      });

      if (points.length > 0) {
        heatLayer = L.heatLayer(points, {
          radius: 32,
          blur: 28,
          maxZoom: 18,
          gradient: HEAT_GRADIENT,
        }).addTo(map);
      }
    }

    window.__communishieldInit = function (cfg) {
      render((cfg && cfg.reports) || []);
    };

    window.addEventListener("message", function (e) {
      try {
        var d = JSON.parse(e.data);
        if (d.type === "init") window.__communishieldInit(d);
      } catch (err) {}
    });
  })();
</script>
</body>
</html>
`;

const AdminHeatMap = ({ style, reports = [] }) => {
  const mapRef = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const isWeb = Platform.OS === "web";
  const reportsRef = useRef(reports);
  reportsRef.current = reports;

  const pushInit = () => {
    if (!mapRef.current) return;
    const cfg = JSON.stringify({ type: "init", reports: reportsRef.current });
    if (isWeb) {
      mapRef.current.contentWindow?.postMessage(cfg, "*");
    } else {
      mapRef.current.injectJavaScript(
        `window.__communishieldInit && window.__communishieldInit(${cfg}); true;`
      );
    }
  };

  useEffect(() => {
    if (!loaded) return;
    pushInit();
  }, [loaded, reports]);

  if (isWeb) {
    return (
      <iframe
        ref={mapRef}
        srcDoc={MAP_HTML}
        style={{ width: "100%", height: "100%", border: "0", display: "block" }}
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
        onLoadEnd={() => setLoaded(true)}
        javaScriptEnabled
        originWhitelist={["*"]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  fill: {
    width: "100%",
    height: "100%",
  },
});

export default AdminHeatMap;

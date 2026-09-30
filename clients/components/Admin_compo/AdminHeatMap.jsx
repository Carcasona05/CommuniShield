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
  .leaflet-popup-content-wrapper{border-radius:12px;border:1px solid #E3EAF6;box-shadow:0 6px 20px rgba(15,30,60,0.18);padding:0;overflow:hidden;}
  .leaflet-popup-content{margin:0;}
  .cs-dot{filter:drop-shadow(0 1px 2px rgba(15,30,60,0.35));transition:stroke-width 0.15s ease;}
  .cs-dot:hover{stroke-width:4;}
  .cs-pop{min-width:214px;font-family:Arial,Helvetica,sans-serif;color:#1E2B45;padding:10px 12px;}
  .cs-pop-top{display:flex;align-items:center;gap:8px;margin-bottom:5px;}
  .cs-pop-badge{font-size:9.5px;font-weight:700;letter-spacing:0.5px;color:#FFFFFF;border-radius:999px;padding:2px 8px;text-transform:uppercase;white-space:nowrap;}
  .cs-pop-title{font-size:13.5px;font-weight:700;}
  .cs-pop-loc{font-size:12px;color:#5D6F92;margin-bottom:7px;word-break:break-word;}
  .cs-pop-meta{display:flex;justify-content:space-between;gap:10px;font-size:11.5px;color:#4B5D7A;padding-top:7px;border-top:1px solid #EEF2F8;}
  .cs-pop-nav{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid #EEF2F8;}
  .cs-nav-btn{flex:1;border:1px solid #CCD6E8;background:#F9FBFF;color:#294880;font-size:12px;font-weight:700;padding:5px 0;border-radius:8px;cursor:pointer;}
  .cs-nav-btn:hover{background:#E8EFFB;}
  .cs-nav-count{font-size:11.5px;color:#6B7A99;font-weight:700;white-space:nowrap;}
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
    var SEVERITY_RANK = { Low: 1, Medium: 2, High: 3, Critical: 4 };
    var DOT_RADIUS = { Low: 7, Medium: 8, High: 9, Critical: 9.5 };

    var HEAT_GRADIENT = {
      0.3: "#22c55e",
      0.5: "#eab308",
      0.75: "#f97316",
      1: "#ef4444",
    };

    function severityOf(r) {
      return SEVERITY_INTENSITY[r.severity] != null ? r.severity : "Medium";
    }

    function esc(value) {
      return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function worstSeverity(list) {
      var best = "Medium";
      var bestRank = 0;
      (list || []).forEach(function (r) {
        var sev = severityOf(r);
        var rank = SEVERITY_RANK[sev] || 0;
        if (rank > bestRank) {
          bestRank = rank;
          best = sev;
        }
      });
      return best;
    }

    var markerLayer = L.layerGroup().addTo(map);
    var heatLayer = null;
    var groups = {};

    function popupHtml(key) {
      var group = groups[key];
      if (!group) return "";
      var report = group.list[group.idx];
      var sev = severityOf(report);
      var color = SEVERITY_COLOR[sev] || "#294880";
      var score = report.ai_score != null ? report.ai_score + "%" : "\u2014";
      var html =
        '<div class="cs-pop">' +
          '<div class="cs-pop-top">' +
            '<span class="cs-pop-badge" style="background:' + color + ';">' +
              sev +
            "</span>" +
            '<span class="cs-pop-title">' +
              esc(report.incident_type || "Incident") +
            "</span>" +
          "</div>" +
          '<div class="cs-pop-loc">' + esc(report.location || "") + "</div>" +
          '<div class="cs-pop-meta">' +
            "<span>Status: " + esc(report.status || "Pending Review") + "</span>" +
            "<span>AI Score: " + score + "</span>" +
          "</div>";
      if (group.list.length > 1) {
        html +=
          '<div class="cs-pop-nav">' +
            '<button class="cs-nav-btn" type="button" data-key="' +
            esc(key) +
            '" data-dir="-1">\u2039 Prev</button>' +
            '<span class="cs-nav-count">' +
            (group.idx + 1) +
            " / " +
            group.list.length +
            "</span>" +
            '<button class="cs-nav-btn" type="button" data-key="' +
            esc(key) +
            '" data-dir="1">Next \u203A</button>' +
          "</div>";
      }
      return html + "</div>";
    }

    window.__csShift = function (key, dir) {
      var group = groups[key];
      if (!group || group.list.length < 2) return;
      group.idx = (group.idx + dir + group.list.length) % group.list.length;
      group.marker.setPopupContent(popupHtml(key));
      if (!group.marker.isPopupOpen()) group.marker.openPopup();
    };

    document.getElementById("map").addEventListener("click", function (e) {
      var btn =
        e.target && e.target.closest ? e.target.closest(".cs-nav-btn") : null;
      if (!btn) return;
      window.__csShift(
        btn.getAttribute("data-key"),
        Number(btn.getAttribute("data-dir"))
      );
    });

    function render(list) {
      markerLayer.clearLayers();
      if (heatLayer) {
        map.removeLayer(heatLayer);
        heatLayer = null;
      }
      groups = {};

      var points = [];

      (list || []).forEach(function (r) {
        if (r.latitude == null || r.longitude == null) return;
        var lat = Number(r.latitude);
        var lng = Number(r.longitude);
        if (!isFinite(lat) || !isFinite(lng)) return;

        var sev = severityOf(r);
        points.push([lat, lng, SEVERITY_INTENSITY[sev]]);

        var key = lat.toFixed(4) + "," + lng.toFixed(4);
        if (!groups[key]) groups[key] = { list: [], idx: 0, marker: null };
        groups[key].list.push(r);
      });

      Object.keys(groups).forEach(function (key) {
        var group = groups[key];
        var first = group.list[0];
        var sev = worstSeverity(group.list);
        var marker = L.circleMarker(
          [Number(first.latitude), Number(first.longitude)],
          {
            radius: DOT_RADIUS[sev] || 8,
            color: "#FFFFFF",
            weight: 2.5,
            fillColor: SEVERITY_COLOR[sev] || "#294880",
            fillOpacity: 0.95,
            className: "cs-dot",
          }
        );
        marker.bindPopup(popupHtml(key));
        group.marker = marker;
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

/* Colorado Deep Dive – Leaflet map (Colorado-only bounds) + LIHTC points + QCT/DDA overlays
   Compatibility build: no async/await (avoids syntax errors on older parsers / bad transpile).
*/
(function () {
  function fetchJSON(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error("Fetch failed " + res.status + ": " + url);
      return res.json();
    });
  }

  // ArcGIS helper: paginated GeoJSON query (FeatureServer/MapServer layer)
  function arcgisQueryGeoJSON(layerUrl, where, outFields) {
    var pageSize = 2000;
    var offset = 0;
    var all = { type: "FeatureCollection", features: [] };

    function loop() {
      var params = new URLSearchParams({
        where: where || "1=1",
        outFields: outFields || "*",
        returnGeometry: "true",
        f: "geojson",
        resultRecordCount: String(pageSize),
        resultOffset: String(offset),
        outSR: "4326",
        returnExceededLimitFeatures: "true"
      });

      return fetchJSON(layerUrl + "/query?" + params.toString()).then(function (gj) {
        var feats = (gj && gj.features) ? gj.features : [];
        if (feats.length === 0) return all;

        Array.prototype.push.apply(all.features, feats);

        var exceeded = !!(gj && (gj.exceededTransferLimit || (gj.properties && gj.properties.exceededTransferLimit)));
        if (!exceeded && feats.length < pageSize) return all;

        offset += pageSize;
        if (offset > 200000) return all; // guardrail
        return loop();
      });
    }

    return loop();
  }

  function resolveArcGISItemServiceUrl(itemId) {
    return fetchJSON("https://www.arcgis.com/sharing/rest/content/items/" + itemId + "?f=json")
      .then(function (info) { return info && info.url; });
  }

  function initColoradoDeepDiveMap() {
    if (!window.L || !window.L.map) {
      console.warn("Leaflet not loaded; cannot initialize CO deep dive map.");
      return;
    }

    var mapEl = document.getElementById("co-map");
    if (!mapEl) {
      console.warn("Missing #co-map container.");
      return;
    }

    var map = L.map("co-map", { zoomControl: true, scrollWheelZoom: true });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }).addTo(map);

    // Rough CO bounds; refined once boundary loads
    var CO_BOUNDS = L.latLngBounds([36.7, -109.1], [41.1, -102.0]);
    map.fitBounds(CO_BOUNDS);

    // Load CO state boundary + counties from us-atlas TopoJSON (reliable on GH Pages)
    function loadTopo() {
      return Promise.all([
        fetchJSON("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json"),
        fetchJSON("https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json")
      ]).then(function (arr) {
        var statesTopo = arr[0];
        var countiesTopo = arr[1];
        if (!window.topojson || !window.topojson.feature) {
          console.warn("topojson-client not loaded; skipping topo boundary.");
          return;
        }
        var states = topojson.feature(statesTopo, statesTopo.objects.states);
        var co = states.features.filter(function (f) { return String(f.id) === "08"; })[0];
        if (co) {
          var coLayer = L.geoJSON(co, { style: { weight: 2, color: "#1f2937", fillOpacity: 0.03 } }).addTo(map);
          try { map.fitBounds(coLayer.getBounds()); } catch (e) {}
        }

        var counties = topojson.feature(countiesTopo, countiesTopo.objects.counties);
        // Colorado counties: FIPS state prefix 08 => ids 08001... => numeric id / 1000 = 8 for us-atlas
        var coCounties = counties.features.filter(function (f) { return Math.floor(Number(f.id) / 1000) === 8; });
        if (coCounties.length) {
          L.geoJSON({ type: "FeatureCollection", features: coCounties }, {
            style: { weight: 1, color: "rgba(31,41,55,.35)", fillOpacity: 0.02 }
          }).addTo(map);
        }
      }).catch(function (e) {
        console.warn("Topo boundary load failed:", e);
      });
    }

    // LIHTC points (HUD eGIS Affht MapService layer 30) — best effort
    function loadLIHTCPoints() {
      var layerUrl = "https://gis.hud.gov/arcgis/rest/services/egis/affht/MapServer/30";
      // Clip to Colorado bbox
      var where = "1=1";
      return arcgisQueryGeoJSON(layerUrl, where, "*").then(function (gj) {
        if (!gj || !gj.features || !gj.features.length) return;
        // Filter by CO bbox
        var feats = gj.features.filter(function (f) {
          var c = f && f.geometry && f.geometry.coordinates;
          if (!c) return false;
          var lon = c[0], lat = c[1];
          return lat >= 36.7 && lat <= 41.1 && lon >= -109.1 && lon <= -102.0;
        });
        if (!feats.length) return;
        L.geoJSON({ type: "FeatureCollection", features: feats }, {
          pointToLayer: function (feature, latlng) {
            return L.circleMarker(latlng, { radius: 4, weight: 1, color: "#0f172a", fillColor: "#2563eb", fillOpacity: 0.75 });
          },
          onEachFeature: function (feature, layer) {
            var p = feature.properties || {};
            var name = p.PROJECT_NAME || p.ProjectName || p.NAME || "LIHTC Project";
            var city = p.CITY || p.City || "";
            var units = p.TOTAL_UNITS || p.TotalUnits || p.UNITS || "";
            layer.bindPopup("<b>" + name + "</b><br/>" + (city ? (city + "<br/>") : "") + (units ? ("Units: " + units) : ""));
          }
        }).addTo(map);
      }).catch(function (e) {
        console.warn("LIHTC points load failed:", e);
      });
    }

    // QCT/DDA overlays — optional, depends on ArcGIS availability.
    // These item IDs are placeholders unless you confirm the exact HUD ArcGIS item IDs you want.
    function loadOverlay(itemId, style) {
      if (!itemId) return Promise.resolve();
      return resolveArcGISItemServiceUrl(itemId).then(function (url) {
        if (!url) return;
        // Assume FeatureServer/0
        return arcgisQueryGeoJSON(url.replace(/\/?$/, "") + "/0", "1=1", "*").then(function (gj) {
          if (!gj || !gj.features || !gj.features.length) return;
          // Filter to CO bbox by centroid-ish (first coordinate)
          var feats = gj.features.filter(function (f) {
            var g = f && f.geometry;
            if (!g) return false;
            // naive bbox test using first coordinate
            var coords = (g.type === "Polygon") ? g.coordinates[0] : (g.type === "MultiPolygon" ? g.coordinates[0][0] : null);
            if (!coords || !coords.length) return false;
            var lon = coords[0][0], lat = coords[0][1];
            return lat >= 36.7 && lat <= 41.1 && lon >= -109.1 && lon <= -102.0;
          });
          if (!feats.length) return;
          L.geoJSON({ type: "FeatureCollection", features: feats }, { style: style }).addTo(map);
        });
      }).catch(function (e) {
        console.warn("Overlay load failed:", e);
      });
    }

    loadTopo();
    loadLIHTCPoints();

    // If you later provide the HUD item IDs you want, put them here:
    // loadOverlay("HUD_QCT_ITEM_ID_HERE", { color:"#b91c1c", weight:1, fillOpacity:0.08 });
    // loadOverlay("HUD_DDA_ITEM_ID_HERE", { color:"#7c3aed", weight:1, fillOpacity:0.08 });
  }

  // Run after DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initColoradoDeepDiveMap);
  } else {
    initColoradoDeepDiveMap();
  }
})();

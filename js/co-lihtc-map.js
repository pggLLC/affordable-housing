
/* Colorado Deep Dive – Leaflet map + live GeoJSON from public ArcGIS services
   Layers:
   - Colorado State Extent (OIT basemap)        : MapServer/28
   - Colorado Census Counties (OIT basemap)     : MapServer/52
   - Municipal Boundaries (OIT basemap)         : MapServer/34
   - LIHTC projects (HUD eGIS)                  : AffhtMapService/30
   - QCT 2026 overlay (HUD ArcGIS item)         : f55f80843c9a436ba8e578a54cdd8cea
   - DDA 2026 overlay (HUD ArcGIS item)         : 87d645f216024a07936c0f8bb0f20366
*/
(function () {
  function $(id) { return document.getElementById(id); }

  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed ${res.status}: ${url}`);
    return res.json();
  }

  // ArcGIS helper: paginated GeoJSON queries
  async function arcgisQueryGeoJSON(layerUrl, where, outFields) {
    const pageSize = 2000;
    let all = null;
    let offset = 0;

    while (true) {
      const params = new URLSearchParams({
        where: where || "1=1",
        outFields: outFields || "*",
        returnGeometry: "true",
        f: "geojson",
        resultRecordCount: String(pageSize),
        resultOffset: String(offset),
        outSR: "4326"
      });

      const gj = await fetchJSON(`${layerUrl}/query?${params.toString()}`);
      if (!all) all = { type: "FeatureCollection", features: [] };
      const feats = (gj && gj.features) ? gj.features : [];
      all.features.push(...feats);

      // If fewer than pageSize, we're done.
      if (feats.length < pageSize) break;
      offset += pageSize;
    }
    return all || { type: "FeatureCollection", features: [] };
  }

  async function resolveArcGISItemServiceUrl(itemId) {
    const info = await fetchJSON(`https://www.arcgis.com/sharing/rest/content/items/${itemId}?f=json`);
    return info.url; // FeatureServer URL
  }

  const CO_BASEMAP = "https://gis.colorado.gov/public/rest/services/OIT/Colorado_State_Basemap/MapServer";
  const CO_STATE_EXTENT = `${CO_BASEMAP}/28`;
  const CO_COUNTIES = `${CO_BASEMAP}/52`;
  const CO_MUNICIPAL = `${CO_BASEMAP}/34`;

  const HUD_LIHTC_LAYER = "https://egis.hud.gov/arcgis/rest/services/affht/AffhtMapService/MapServer/30";
  const QCT_2026_ITEM = "f55f80843c9a436ba8e578a54cdd8cea";
  const DDA_2026_ITEM = "87d645f216024a07936c0f8bb0f20366";

  function styleBoundary(kind) {
    if (kind === "state") return { color: "rgba(255,255,255,0.45)", weight: 2, fill: false };
    if (kind === "counties") return { color: "rgba(255,255,255,0.18)", weight: 1, fill: false };
    if (kind === "places") return { color: "rgba(160,200,255,0.18)", weight: 1, fill: false, dashArray: "2,4" };
    return { color: "rgba(255,255,255,0.2)", weight: 1, fill: false };
  }

  function styleOverlay(kind) {
    if (kind === "qct") return { color: "rgba(120,255,170,0.55)", weight: 1, fillColor: "rgba(120,255,170,0.22)", fillOpacity: 0.35 };
    if (kind === "dda") return { color: "rgba(255,200,90,0.55)", weight: 1, fillColor: "rgba(255,200,90,0.20)", fillOpacity: 0.35 };
    return { color: "rgba(255,255,255,0.3)", weight: 1, fillOpacity: 0.1 };
  }

  function popupForLIHTC(props) {
    const yn = (v) => (v === 1 || v === "1" ? "Yes" : "No");
    const safe = (v) => (v === null || v === undefined ? "" : String(v));
    return `
      <div style="min-width:240px">
        <div style="font-weight:700; margin-bottom:.25rem;">${safe(props.PROJECT) || "LIHTC Project"}</div>
        <div style="opacity:.9; font-size:12px; margin-bottom:.35rem;">
          ${safe(props.STD_ADDR || props.PROJ_ADD || "")}${props.STD_CITY ? ", " + safe(props.STD_CITY) : ""} ${safe(props.STD_ST || props.PROJ_ST || "")} ${safe(props.STD_ZIP5 || "")}
        </div>
        <div style="font-size:12px; line-height:1.35;">
          <div><b>Units:</b> ${safe(props.N_UNITS)} (LI: ${safe(props.LI_UNITS)})</div>
          <div><b>Placed in service:</b> ${safe(props.YR_PIS)}</div>
          <div><b>QCT:</b> ${yn(props.QCT)} &nbsp; <b>DDA:</b> ${yn(props.DDA)}</div>
        </div>
      </div>
    `;
  }

  async function init() {
    const mapEl = $("coMap");
    if (!mapEl || typeof L === "undefined") return;

    const map = L.map("coMap", { zoomControl: true, preferCanvas: true });

    // Dark basemap: CARTO Dark (no key)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }).addTo(map);

    // Boundaries (live)
    const [stateGJ, countiesGJ, municipalGJ] = await Promise.all([
      arcgisQueryGeoJSON(CO_STATE_EXTENT, "1=1", "*"),
      arcgisQueryGeoJSON(CO_COUNTIES, "1=1", "NAME,STATE_ABBR,COUNTY_FIPS,FIPS"),
      arcgisQueryGeoJSON(CO_MUNICIPAL, "1=1", "NAME10,NAMELSAD10,GEOID10")
    ]);

    const stateLayer = L.geoJSON(stateGJ, { style: () => styleBoundary("state") }).addTo(map);
    const countiesLayer = L.geoJSON(countiesGJ, {
      style: () => styleBoundary("counties"),
      onEachFeature: (f, layer) => layer.bindTooltip((f.properties && f.properties.NAME) ? `${f.properties.NAME} County` : "", { sticky: true, opacity: 0.85 })
    }).addTo(map);

    const placesLayer = L.geoJSON(municipalGJ, {
      style: () => styleBoundary("places"),
      onEachFeature: (f, layer) => layer.bindTooltip((f.properties && (f.properties.NAMELSAD10 || f.properties.NAME10)) || "", { sticky: true, opacity: 0.85 })
    });

    map.fitBounds(stateLayer.getBounds(), { padding: [12, 12] });

    // QCT/DDA overlays (2026) via HUD ArcGIS items
    let qctUrl = null, ddaUrl = null;
    let qctLayer = null, ddaLayer = null;

    async function loadOverlaysIfNeeded() {
      if (!qctUrl) qctUrl = await resolveArcGISItemServiceUrl(QCT_2026_ITEM);
      if (!ddaUrl) ddaUrl = await resolveArcGISItemServiceUrl(DDA_2026_ITEM);

      if (!qctLayer) {
        const qctGJ = await arcgisQueryGeoJSON(qctUrl.replace(/\/?$/, "") + "/0", "STATEFP='08'", "*");
        qctLayer = L.geoJSON(qctGJ, { style: () => styleOverlay("qct") });
      }
      if (!ddaLayer) {
        const ddaGJ = await arcgisQueryGeoJSON(ddaUrl.replace(/\/?$/, "") + "/0", "STATEFP='08'", "*");
        ddaLayer = L.geoJSON(ddaGJ, { style: () => styleOverlay("dda") });
      }
    }

    // LIHTC points
    let lihtcAll = null;
    const lihtcLayer = L.layerGroup().addTo(map);

    async function loadLIHTC() {
      // Filter to Colorado via PROJ_ST
      const gj = await arcgisQueryGeoJSON(HUD_LIHTC_LAYER, "PROJ_ST='CO'", "*");
      lihtcAll = gj;
      renderLIHTC();
    }

    function renderLIHTC() {
      lihtcLayer.clearLayers();
      if (!lihtcAll) return;

      const onlyQCT = !!$("filterQCT")?.checked;
      const onlyDDA = !!$("filterDDA")?.checked;

      for (const f of (lihtcAll.features || [])) {
        const p = f.properties || {};
        if (onlyQCT && !(p.QCT === 1 || p.QCT === "1")) continue;
        if (onlyDDA && !(p.DDA === 1 || p.DDA === "1")) continue;

        const coords = f.geometry && f.geometry.type === "Point" ? f.geometry.coordinates : null;
        if (!coords) continue;

        const marker = L.circleMarker([coords[1], coords[0]], {
          radius: 5,
          weight: 1,
          color: "rgba(95,168,255,0.95)",
          fillColor: "rgba(95,168,255,0.55)",
          fillOpacity: 0.8
        });

        marker.bindPopup(popupForLIHTC(p));
        marker.addTo(lihtcLayer);
      }
    }

    // Wire toggles
    async function wire() {
      const chkCounties = $("layerCounties");
      const chkPlaces = $("layerPlaces");
      const chkQCT = $("layerQCT");
      const chkDDA = $("layerDDA");
      const fQCT = $("filterQCT");
      const fDDA = $("filterDDA");

      if (chkCounties) chkCounties.addEventListener("change", () => {
        chkCounties.checked ? countiesLayer.addTo(map) : map.removeLayer(countiesLayer);
      });
      if (chkPlaces) chkPlaces.addEventListener("change", () => {
        chkPlaces.checked ? placesLayer.addTo(map) : map.removeLayer(placesLayer);
      });

      async function toggleOverlays() {
        try {
          await loadOverlaysIfNeeded();
          if (chkQCT && qctLayer) chkQCT.checked ? qctLayer.addTo(map) : map.removeLayer(qctLayer);
          if (chkDDA && ddaLayer) chkDDA.checked ? ddaLayer.addTo(map) : map.removeLayer(ddaLayer);
        } catch (e) {
          console.warn("Overlay load failed:", e);
        }
      }

      if (chkQCT) chkQCT.addEventListener("change", toggleOverlays);
      if (chkDDA) chkDDA.addEventListener("change", toggleOverlays);

      if (fQCT) fQCT.addEventListener("change", renderLIHTC);
      if (fDDA) fDDA.addEventListener("change", renderLIHTC);

      // initial overlays
      toggleOverlays();
    }

    wire();
    loadLIHTC();

    setTimeout(() => map.invalidateSize(), 250);
    window.addEventListener("resize", () => map.invalidateSize());
  }

  document.addEventListener("DOMContentLoaded", init);
})();

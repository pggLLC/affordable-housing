
/* Colorado Deep Dive – Leaflet map (Colorado-only bounds) + HUD LIHTC points + HUD 2026 QCT/DDA overlays
   - Boundaries: us-atlas topojson (state + counties)
   - QCT/DDA: HUD ArcGIS items (queried by Colorado bounding box)
*/
(function () {
  if (!window.L) return;

  const MAP_ID = "co-map";
  const mapEl = document.getElementById(MAP_ID);
  if (!mapEl) return;

  async function fetchJSON(url){
    const res = await fetch(url);
    if(!res.ok) throw new Error(`Fetch failed ${res.status}: ${url}`);
    return res.json();
  }

  function coloradoBBox(){
    // rough CO bbox used until we compute from boundary
    return { xmin:-109.0603, ymin:36.9924, xmax:-102.0416, ymax:41.0034 };
  }

  // ArcGIS helper: GeoJSON query with bbox geometry
  async function arcgisQueryGeoJSON(layerUrl, bbox, where, outFields){
    const params = new URLSearchParams({
      where: where || "1=1",
      outFields: outFields || "*",
      returnGeometry: "true",
      f: "geojson",
      outSR: "4326",
      geometryType: "esriGeometryEnvelope",
      spatialRel: "esriSpatialRelIntersects",
      geometry: JSON.stringify({
        xmin:bbox.xmin, ymin:bbox.ymin, xmax:bbox.xmax, ymax:bbox.ymax,
        spatialReference:{ wkid:4326 }
      }),
      resultRecordCount: "4000",
      resultOffset: "0",
      returnExceededLimitFeatures: "true"
    });

    // paginate if needed
    const all = { type:"FeatureCollection", features:[] };
    let offset = 0;
    while(true){
      params.set("resultOffset", String(offset));
      const gj = await fetchJSON(`${layerUrl}/query?${params.toString()}`);
      const feats = (gj && gj.features) ? gj.features : [];
      if(!feats.length) break;
      all.features.push(...feats);
      const exceeded = !!(gj && (gj.exceededTransferLimit || (gj.properties && gj.properties.exceededTransferLimit)));
      if(!exceeded) break;
      offset += feats.length;
      if(offset > 200000) break;
    }
    return all;
  }

  async function resolveArcGISItemServiceUrl(itemId){
    const info = await fetchJSON(`https://www.arcgis.com/sharing/rest/content/items/${itemId}?f=json`);
    return info.url; // FeatureServer URL
  }

  // HUD services
  const HUD_LIHTC_LAYER = "https://egis.hud.gov/arcgis/rest/services/affht/AffhtMapService/MapServer/30";
  const QCT_2026_ITEM = "f55f80843c9a436ba8e578a54cdd8cea";
  const DDA_2026_ITEM = "87d645f216024a07936c0f8bb0f20366";

  function styleCounty(){ return { color:"rgba(30,41,59,0.25)", weight:1, fill:false }; }
  function styleState(){ return { color:"rgba(15,23,42,0.55)", weight:2, fill:false }; }
  function styleOverlay(kind){
    if(kind==="qct") return { color:"rgba(22,163,74,0.9)", weight:1, fillColor:"rgba(22,163,74,0.25)", fillOpacity:0.55 };
    if(kind==="dda") return { color:"rgba(234,88,12,0.9)",  weight:1, fillColor:"rgba(234,88,12,0.22)",  fillOpacity:0.55 };
    return { color:"rgba(100,116,139,0.5)", weight:1, fillOpacity:0.2 };
  }

  function popupForLIHTC(p){
    const safe = (v)=> (v===null || v===undefined) ? "" : String(v);
    return `
      <div style="min-width:240px">
        <div style="font-weight:700; margin-bottom:.25rem;">${safe(p.PROJECT) || "LIHTC Project"}</div>
        <div style="opacity:.9; font-size:12px; margin-bottom:.35rem;">
          ${safe(p.STD_ADDR || p.PROJ_ADD || "")}${p.STD_CITY ? ", "+safe(p.STD_CITY) : ""} ${safe(p.STD_ST || p.PROJ_ST || "")} ${safe(p.STD_ZIP5 || "")}
        </div>
        <div style="font-size:12px; line-height:1.35;">
          <div><b>Units:</b> ${safe(p.N_UNITS)} (LI: ${safe(p.LI_UNITS)})</div>
          <div><b>Placed in service:</b> ${safe(p.YR_PIS)}</div>
        </div>
      </div>
    `;
  }

  // Init Leaflet map
  const map = L.map(MAP_ID, { zoomControl:true });
  const bbox = coloradoBBox();
  map.fitBounds([[bbox.ymin, bbox.xmin],[bbox.ymax, bbox.xmax]]);
  map.setMaxBounds([[bbox.ymin-0.5, bbox.xmin-0.5],[bbox.ymax+0.5, bbox.xmax+0.5]]);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  const overlays = {};

  async function addColoradoBoundaries(){
    // us-atlas topojson
    const statesTopo = await fetchJSON("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json");
    const countiesTopo = await fetchJSON("https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json");

    // Colorado state id is 8 (FIPS 08)
    const stateFeature = topojson.feature(statesTopo, statesTopo.objects.states).features
      .find(f => String(f.id) === "8");

    const counties = topojson.feature(countiesTopo, countiesTopo.objects.counties).features
      .filter(f => String(f.id).padStart(5,"0").startsWith("08"));

    if(stateFeature){
      const stateLayer = L.geoJSON(stateFeature, { style: styleState() }).addTo(map);
      overlays["Colorado boundary"] = stateLayer;
      // Update bbox from actual geometry for better clipping of overlays
      try{
        const b = stateLayer.getBounds();
        const nb = { xmin:b.getWest(), ymin:b.getSouth(), xmax:b.getEast(), ymax:b.getNorth() };
        map.fitBounds(b.pad(0.05));
        return nb;
      } catch(_){}
    }
    if(counties.length){
      const countyLayer = L.geoJSON({type:"FeatureCollection", features: counties}, { style: styleCounty() }).addTo(map);
      overlays["Counties"] = countyLayer;
    }
    return bbox;
  }

  async function addQctDda(overBbox){
    try{
      const qctUrl = await resolveArcGISItemServiceUrl(QCT_2026_ITEM);
      const qctLayerUrl = qctUrl.endsWith("/FeatureServer") ? (qctUrl + "/0") : qctUrl;
      const qct = await arcgisQueryGeoJSON(qctLayerUrl, overBbox, "1=1", "*");
      if(qct.features && qct.features.length){
        const layer = L.geoJSON(qct, { style: styleOverlay("qct") }).addTo(map);
        overlays["QCT (2026)"] = layer;
      }
    } catch(e){ console.warn("QCT overlay skipped:", e); }

    try{
      const ddaUrl = await resolveArcGISItemServiceUrl(DDA_2026_ITEM);
      const ddaLayerUrl = ddaUrl.endsWith("/FeatureServer") ? (ddaUrl + "/0") : ddaUrl;
      const dda = await arcgisQueryGeoJSON(ddaLayerUrl, overBbox, "1=1", "*");
      if(dda.features && dda.features.length){
        const layer = L.geoJSON(dda, { style: styleOverlay("dda") }).addTo(map);
        overlays["DDA (2026)"] = layer;
      }
    } catch(e){ console.warn("DDA overlay skipped:", e); }
  }

  async function addLihtcPoints(overBbox){
    try{
      const pts = await arcgisQueryGeoJSON(HUD_LIHTC_LAYER, overBbox, "1=1", "*");
      if(pts.features && pts.features.length){
        const layer = L.geoJSON(pts, {
          pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius:5, weight:1, fillOpacity:0.7 }),
          onEachFeature: (f, lyr) => lyr.bindPopup(popupForLIHTC(f.properties||{}))
        }).addTo(map);
        overlays["LIHTC projects"] = layer;
      }
    } catch(e){
      console.warn("LIHTC points skipped:", e);
    }
  }

  (async () => {
    try{
      const betterBbox = await addColoradoBoundaries();
      await Promise.all([addQctDda(betterBbox), addLihtcPoints(betterBbox)]);
      // layer control
      L.control.layers(null, overlays, { collapsed:false }).addTo(map);
    } catch(e){
      console.error("CO map init failed:", e);
    }
  })();
})();


/* Colorado Deep Dive – Leaflet map (Colorado-only bounds) + HUD LIHTC points + HUD 2026 QCT/DDA overlays
   - Boundaries: Colorado State Basemap service (counties & municipalities)
   - LIHTC: HUD eGIS AffhtMapService layer 30 (maps HUD LIHTC database records)
   - QCT/DDA: HUD-published ArcGIS item services (best effort)
*/
(function () {
  function $(id){ return document.getElementById(id); }

  async function fetchJSON(url){
    const res = await fetch(url);
    if(!res.ok) throw new Error(`Fetch failed ${res.status}: ${url}`);
    return res.json();
  }

return res.json();
  }

  async function loadTopoColorado(){
    // Reliable fallback boundary source (TopoJSON)
    const topoStates = await fetchJSON("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json");
    const topoCounties = await fetchJSON("https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json");
    const states = topojson.feature(topoStates, topoStates.objects.states);
    const counties = topojson.feature(topoCounties, topoCounties.objects.counties);

    // Colorado FIPS = 08
    const coState = { type:"FeatureCollection", features: states.features.filter(f => String(f.id).padStart(2,"0")==="08") };
    const coCounties = { type:"FeatureCollection", features: counties.features.filter(f => String(f.id).padStart(5,"0").startsWith("08")) };
    return { coState, coCounties };
  }
  // ArcGIS helper: paginated GeoJSON query
  async function arcgisQueryGeoJSON(layerUrl, where, outFields){
    const pageSize = 2000;
    let offset = 0;
    const all = { type:"FeatureCollection", features:[] };

    while(true){
      const params = new URLSearchParams({
        where: where || "1=1",
        outFields: outFields || "*",
        returnGeometry: "true",
        f: "geojson",
        resultRecordCount: String(pageSize),
        resultOffset: String(offset),
        outSR: "4326",
        returnExceededLimitFeatures: "true"
      });

      const gj = await fetchJSON(`${layerUrl}/query?${params.toString()}`);
      const feats = (gj && gj.features) ? gj.features : [];

      if(feats.length === 0){
        break;
      }
      all.features.push(...feats);

      // ArcGIS sometimes signals more data via exceededTransferLimit
      const exceeded = !!(gj && (gj.exceededTransferLimit || (gj.properties && gj.properties.exceededTransferLimit)));
      if(!exceeded && feats.length < pageSize) break;

      offset += pageSize;

      // Hard guardrail to avoid infinite loops in case a service misbehaves
      if(offset > 200000) break;
    }
    return all;
  }

  async function resolveArcGISItemServiceUrl(itemId){
    const info = await fetchJSON(`https://www.arcgis.com/sharing/rest/content/items/${itemId}?f=json`);
    return info.url; // FeatureServer URL
  }

  // CO boundary layers (public)
  const CO_BASEMAP = "https://gis.colorado.gov/public/rest/services/OIT/Colorado_State_Basemap/MapServer";
  const CO_STATE_EXTENT = `${CO_BASEMAP}/28`;
  const CO_COUNTIES     = `${CO_BASEMAP}/52`;
  const CO_MUNICIPAL    = `${CO_BASEMAP}/34`;

  // HUD LIHTC points (public; corresponds to HUD LIHTC database mapped)
  const HUD_LIHTC_LAYER = "https://egis.hud.gov/arcgis/rest/services/affht/AffhtMapService/MapServer/30";

  // HUD QCT/DDA 2026 ArcGIS items (best effort; if unavailable, overlays silently skip)
  const QCT_2026_ITEM = "f55f80843c9a436ba8e578a54cdd8cea";
  const DDA_2026_ITEM = "87d645f216024a07936c0f8bb0f20366";

  function styleBoundary(kind){
    if(kind==="state") return { color:"rgba(255,255,255,0.45)", weight:2, fill:false };
    if(kind==="counties") return { color:"rgba(255,255,255,0.18)", weight:1, fill:false };
    if(kind==="places") return { color:"rgba(160,200,255,0.18)", weight:1, fill:false, dashArray:"2,4" };
    return { color:"rgba(255,255,255,0.2)", weight:1, fill:false };
  }

  function styleOverlay(kind){
    if(kind==="qct") return { color:"rgba(120,255,170,0.75)", weight:1, fillColor:"rgba(120,255,170,0.30)", fillOpacity:0.55 };
    if(kind==="dda") return { color:"rgba(255,200,90,0.75)",  weight:1, fillColor:"rgba(255,200,90,0.28)",  fillOpacity:0.55 };
    return { color:"rgba(255,255,255,0.3)", weight:1, fillOpacity:0.1 };
  }

  function popupForLIHTC(p){
    const yn = (v)=> (v===1 || v==="1") ? "Yes" : "No";
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
          <div><b>QCT:</b> ${yn(p.QCT)} &nbsp; <b>DDA:</b> ${yn(p.DDA)}</div>
        </div>
      </div>
    `;
  }

  function addLegendControl(map){
    const legend = L.control({ position: "bottomright" });
    legend.onAdd = function(){
      const div = L.DomUtil.create("div", "map-legend");
      div.innerHTML = `
        <div style="font-weight:700; margin-bottom:6px;">Legend</div>
        <div class="row"><span class="dot" style="background:#5fa8ff;"></span> LIHTC project (HUD)</div>
        <div class="row"><span class="swatch" style="background:rgba(120,255,170,.22); border-color:rgba(120,255,170,.45)"></span> QCT overlay</div>
        <div class="row"><span class="swatch" style="background:rgba(255,200,90,.20); border-color:rgba(255,200,90,.45)"></span> DDA overlay</div>
      `;
      // prevent scroll/drag on legend from affecting map
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    };
    legend.addTo(map);
  }

  async function init(){

  function padBoundsMiles(bounds, miles){
    const milesPerDegLat = 69.0;
    const milesPerDegLng = 54.6; // approx at CO latitude
    const padLat = miles / milesPerDegLat;
    const padLng = miles / milesPerDegLng;
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    return L.latLngBounds(
      [sw.lat - padLat, sw.lng - padLng],
      [ne.lat + padLat, ne.lng + padLng]
    );
  }

    const mapEl = $("coMap");
    if(!mapEl || typeof L==="undefined") return;

    const map = L.map("coMap", {
      zoomControl:true,
      preferCanvas:true,
      minZoom: 6,
      maxZoom: 12
    });

    // dark basemap, no key
    map.createPane('overlayPaneCo');
    map.getPane('overlayPaneCo').style.zIndex = 410;
    map.createPane('pointsPaneCo');
    map.getPane('pointsPaneCo').style.zIndex = 420;

    L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }).addTo(map);

    addLegendControl(map);

    // load boundaries
    const [stateGJ, countiesGJ, placesGJ] = await Promise.all([
      arcgisQueryGeoJSON(CO_STATE_EXTENT, "1=1", "*"),
      arcgisQueryGeoJSON(CO_COUNTIES, "1=1", "NAME,STATE_ABBR,COUNTY_FIPS,FIPS"),
      arcgisQueryGeoJSON(CO_MUNICIPAL, "1=1", "NAME10,NAMELSAD10,GEOID10")
    ]);

    const stateLayer = L.geoJSON(stateGJ, { style:()=>styleBoundary("state") }).addTo(map);

    const countiesLayer = L.geoJSON(countiesGJ, {
      style:()=>styleBoundary("counties"),
      onEachFeature:(f, layer)=> layer.bindTooltip((f.properties && f.properties.NAME) ? `${f.properties.NAME} County` : "", { sticky:true, opacity:0.85 })
    }).addTo(map);

    const placesLayer = L.geoJSON(placesGJ, {
      style:()=>styleBoundary("places"),
      onEachFeature:(f, layer)=> layer.bindTooltip((f.properties && (f.properties.NAMELSAD10 || f.properties.NAME10)) || "", { sticky:true, opacity:0.85 })
    });

    // lock map to Colorado bounds (no panning outside)
    const coBounds = stateLayer.getBounds();
    map.fitBounds(coBounds, { padding:[12,12] });
    // Prevent zooming out past Colorado extent
    const minZ = map.getBoundsZoom(paddedBounds, true);
    map.setMinZoom(minZ);
    map.setZoom(minZ);
    const paddedBounds = padBoundsMiles(coBounds, 50);
    map.setMaxBounds(paddedBounds);
    map.options.maxBoundsViscosity = 1.0;

    // QCT/DDA overlays
    let qctLayer = null, ddaLayer = null, qctUrl = null, ddaUrl = null;

    async function ensureOverlays(){
      if(!qctUrl) qctUrl = await resolveArcGISItemServiceUrl(QCT_2026_ITEM);
      if(!ddaUrl) ddaUrl = await resolveArcGISItemServiceUrl(DDA_2026_ITEM);

      if(!qctLayer){
        const qctGJ = await arcgisQueryGeoJSON(qctUrl.replace(/\/?$/,"") + "/0", "(STATEFP='08') OR (STATE='08') OR (STATEFP20='08') OR (STATEFP10='08')", "*");
        qctLayer = L.geoJSON(qctGJ, { pane:'overlayPaneCo', style:()=>styleOverlay("qct") });
      }
      if(!ddaLayer){
        const ddaGJ = await arcgisQueryGeoJSON(ddaUrl.replace(/\/?$/,"") + "/0", "(STATEFP='08') OR (STATE='08') OR (STATEFP20='08') OR (STATEFP10='08')", "*");
        ddaLayer = L.geoJSON(ddaGJ, { pane:'overlayPaneCo', style:()=>styleOverlay("dda") });
      }
    }

    async function syncOverlayVisibility(){
      const chkQCT = $("layerQCT");
      const chkDDA = $("layerDDA");
      try{
        await ensureOverlays();
        if(chkQCT && qctLayer) chkQCT.checked ? qctLayer.addTo(map) : map.removeLayer(qctLayer);
        if(chkDDA && ddaLayer) chkDDA.checked ? ddaLayer.addTo(map) : map.removeLayer(ddaLayer);
      }catch(e){
        console.warn("QCT/DDA overlays unavailable:", e);
      }
    }

    // LIHTC points (HUD mapped database)
    let lihtcAll = null;
    const lihtcGroup = L.layerGroup().addTo(map);

    async function loadLIHTC(){
      const gj = await arcgisQueryGeoJSON(HUD_LIHTC_LAYER, "(PROJ_ST='CO') OR (STD_ST='CO')", "*");
      lihtcAll = gj;
      renderLIHTC();
    }

    function renderLIHTC(){
      lihtcGroup.clearLayers();
      if(!lihtcAll) return;

      const onlyQCT = !!$("filterQCT")?.checked;
      const onlyDDA = !!$("filterDDA")?.checked;

      for(const f of (lihtcAll.features || [])){
        const p = f.properties || {};
        if(onlyQCT && !(p.QCT===1 || p.QCT==="1")) continue;
        if(onlyDDA && !(p.DDA===1 || p.DDA==="1")) continue;

        const coords = f.geometry && f.geometry.type==="Point" ? f.geometry.coordinates : null;
        if(!coords) continue;

        const marker = L.circleMarker([coords[1], coords[0]], { pane:'pointsPaneCo',
          radius:5, weight:1,
          color:"rgba(95,168,255,0.95)",
          fillColor:"rgba(95,168,255,0.55)",
          fillOpacity:0.8
        });
        marker.bindPopup(popupForLIHTC(p));
        marker.addTo(lihtcGroup);
      }
    }

    function wire(){
      const chkCounties = $("layerCounties");
      const chkPlaces   = $("layerPlaces");
      const chkQCT      = $("layerQCT");
      const chkDDA      = $("layerDDA");
      const fQCT        = $("filterQCT");
      const fDDA        = $("filterDDA");

      if(chkCounties) chkCounties.addEventListener("change", ()=>{
        chkCounties.checked ? countiesLayer.addTo(map) : map.removeLayer(countiesLayer);
      });
      if(chkPlaces) chkPlaces.addEventListener("change", ()=>{
        chkPlaces.checked ? placesLayer.addTo(map) : map.removeLayer(placesLayer);
      });
      if(chkQCT) chkQCT.addEventListener("change", syncOverlayVisibility);
      if(chkDDA) chkDDA.addEventListener("change", syncOverlayVisibility);
      if(fQCT) fQCT.addEventListener("change", renderLIHTC);
      if(fDDA) fDDA.addEventListener("change", renderLIHTC);

      syncOverlayVisibility();
    }

    wire();
    loadLIHTC();

    setTimeout(()=>map.invalidateSize(), 250);
    window.addEventListener("resize", ()=>map.invalidateSize());
  }

  document.addEventListener("DOMContentLoaded", init);
})();

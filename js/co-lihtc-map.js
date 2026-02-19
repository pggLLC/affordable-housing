/**
 * co-lihtc-map.js
 * Colorado Deep Dive — Leaflet map
 *
 * Layers:
 *  1. CartoDB dark basemap (no API key)
 *  2. Colorado state boundary (us-atlas TopoJSON, FIPS 08)
 *  3. Colorado county boundaries (us-atlas TopoJSON)
 *  4. Colorado places/municipalities (Census TIGER GeoJSON via public API)
 *  5. HUD LIHTC projects for Colorado (HUD eGIS ArcGIS MapServer/30)
 *  6. QCT 2026 overlay (HUD ArcGIS FeatureServer)
 *  7. DDA 2026 overlay (HUD ArcGIS FeatureServer)
 *  8. Transportation (OpenStreetMap roads via tile layer)
 *
 * All external services are public/free — no API keys required.
 */
(function () {
  'use strict';

  /* ---- helpers ---- */
  function $id(id) { return document.getElementById(id); }

  async function fetchJSON(url, opts) {
    const res = await fetch(url, opts);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return res.json();
  }

  /* Paginated ArcGIS GeoJSON query */
  async function arcgisQuery(layerUrl, where, outFields, extraParams) {
    const PAGE = 1000;
    let offset = 0;
    const all = { type: 'FeatureCollection', features: [] };
    let pages = 0;

    while (true) {
      const p = new URLSearchParams({
        where: where || '1=1',
        outFields: outFields || '*',
        returnGeometry: 'true',
        f: 'geojson',
        resultRecordCount: String(PAGE),
        resultOffset: String(offset),
        outSR: '4326',
        returnExceededLimitFeatures: 'true',
        ...(extraParams || {})
      });

      let gj;
      try {
        gj = await fetchJSON(`${layerUrl}/query?${p}`);
      } catch (e) {
        console.warn('ArcGIS query failed:', layerUrl, e.message);
        break;
      }

      const feats = gj && Array.isArray(gj.features) ? gj.features : [];
      if (feats.length === 0) break;
      all.features.push(...feats);

      const exceeded = !!(gj.exceededTransferLimit ||
        (gj.properties && gj.properties.exceededTransferLimit));
      if (!exceeded && feats.length < PAGE) break;
      offset += PAGE;
      pages++;
      if (pages > 150) break; // hard guard
    }
    return all;
  }

  /* ---- config ---- */
  // Colorado boundary/county sources (us-atlas CDN — very reliable)
  const US_STATES_TOPO   = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';
  const US_COUNTIES_TOPO = 'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json';

  // Colorado municipalities from Census TIGER (public GeoJSON API, no key)
  // Using the Census Cartographic Boundary Files API
  const CO_PLACES_URL = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/4';

  // HUD LIHTC projects — ArcGIS MapServer layer 30
  const HUD_LIHTC_LAYER = 'https://egis.hud.gov/arcgis/rest/services/affht/AffhtMapService/MapServer/30';

  // HUD QCT & DDA 2026 feature services (direct FeatureServer endpoints)
  // These are published HUD public services
  const QCT_LAYER = 'https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Qualified_Census_Tracts_2026/FeatureServer/0';
  const DDA_LAYER = 'https://services.arcgis.com/VTyQ9soqVukalItT/arcgis/rest/services/Difficult_Development_Areas_2026/FeatureServer/0';

  // Fallback QCT/DDA item IDs (resolves to FeatureServer URL via ArcGIS Online)
  const QCT_ITEM = 'f55f80843c9a436ba8e578a54cdd8cea';
  const DDA_ITEM = '87d645f216024a07936c0f8bb0f20366';

  /* ---- style functions ---- */
  function styleState()    { return { color: 'rgba(255,255,255,0.55)', weight: 2.5, fill: false }; }
  function styleCounty()   { return { color: 'rgba(255,255,255,0.22)', weight: 1, fill: false }; }
  function stylePlace()    { return { color: 'rgba(140,200,255,0.25)', weight: 0.8, fill: false, dashArray: '3,5' }; }
  function styleQCT()      { return { color: 'rgba(80,220,160,0.85)', weight: 1.5, fillColor: 'rgba(80,220,160,0.18)', fillOpacity: 1 }; }
  function styleDDA()      { return { color: 'rgba(255,185,60,0.85)',  weight: 1.5, fillColor: 'rgba(255,185,60,0.15)',  fillOpacity: 1 }; }

  /* ---- popup builder for LIHTC projects ---- */
  function buildPopup(p) {
    const safe = v => (v == null || v === '') ? '—' : String(v);
    const yn   = v => (v === 1 || v === '1' || v === 'Y') ? '<span style="color:#34d399">Yes</span>' : '<span style="color:#94a3b8">No</span>';
    const addr = [p.STD_ADDR || p.PROJ_ADD, p.STD_CITY || p.PROJ_CTY, p.STD_ST || p.PROJ_ST, p.STD_ZIP5].filter(Boolean).join(', ');

    return `<div style="min-width:240px; max-width:300px; font-size:13px;">
      <div style="font-weight:800; font-size:14px; margin-bottom:5px; line-height:1.3;">${safe(p.PROJECT || p.PROJ_NM) || 'LIHTC Project'}</div>
      ${addr ? `<div style="margin-bottom:8px; opacity:.8;">${addr}</div>` : ''}
      <table style="width:100%; border-collapse:collapse;">
        <tr><td style="padding:2px 0; opacity:.7;">Total units</td><td style="text-align:right; font-weight:700;">${safe(p.N_UNITS)}</td></tr>
        <tr><td style="padding:2px 0; opacity:.7;">Low-income units</td><td style="text-align:right; font-weight:700;">${safe(p.LI_UNITS)}</td></tr>
        <tr><td style="padding:2px 0; opacity:.7;">Placed in service</td><td style="text-align:right;">${safe(p.YR_PIS)}</td></tr>
        <tr><td style="padding:2px 0; opacity:.7;">Credit type</td><td style="text-align:right;">${safe(p.CREDIT)}</td></tr>
        <tr><td style="padding:2px 0; opacity:.7;">QCT</td><td style="text-align:right;">${yn(p.QCT)}</td></tr>
        <tr><td style="padding:2px 0; opacity:.7;">DDA</td><td style="text-align:right;">${yn(p.DDA)}</td></tr>
        <tr><td style="padding:2px 0; opacity:.7;">County</td><td style="text-align:right;">${safe(p.CNTY_NAME || p.PROJ_CTY)}</td></tr>
        ${p.HUD_ID ? `<tr><td style="padding:2px 0; opacity:.7;">HUD ID</td><td style="text-align:right; font-size:11px;">${safe(p.HUD_ID)}</td></tr>` : ''}
      </table>
      <div style="margin-top:8px; font-size:11px; opacity:.55;">Source: HUD LIHTC Database</div>
    </div>`;
  }

  /* ---- legend control ---- */
  function addLegend(map) {
    const ctrl = L.control({ position: 'bottomright' });
    ctrl.onAdd = () => {
      const div = L.DomUtil.create('div', 'map-legend');
      div.innerHTML = `
        <div style="font-weight:800; margin-bottom:7px; font-size:13px;">Legend</div>
        <div class="row"><span class="dot" style="background:#5ec8f8;"></span><span>LIHTC project (HUD)</span></div>
        <div class="row"><span class="swatch" style="background:rgba(80,220,160,.25); border-color:rgba(80,220,160,.5)"></span><span>QCT 2026</span></div>
        <div class="row"><span class="swatch" style="background:rgba(255,185,60,.20); border-color:rgba(255,185,60,.5)"></span><span>DDA 2026</span></div>
        <div class="row"><span class="dot" style="background:rgba(255,255,255,.3); border:1px solid rgba(255,255,255,.4);"></span><span>State/county boundary</span></div>
        <div class="row"><span class="swatch" style="background:transparent; border: 1px dashed rgba(140,200,255,.5)"></span><span>Place boundary</span></div>
      `;
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    };
    ctrl.addTo(map);
  }

  /* ---- status display ---- */
  function setStatus(el, msg, type) {
    if (!el) return;
    const colors = { ok: 'var(--good)', warn: 'var(--warn)', err: 'var(--bad)', info: 'var(--muted)' };
    el.textContent = msg;
    el.style.color = colors[type] || 'var(--muted)';
  }

  /* ---- resolve ArcGIS item URL ---- */
  async function resolveItemUrl(itemId) {
    const info = await fetchJSON(`https://www.arcgis.com/sharing/rest/content/items/${itemId}?f=json`);
    return info.url;
  }

  /* ================================================================
     MAIN INIT
     ================================================================ */
  async function init() {
    const mapEl = $id('coMap');
    if (!mapEl || typeof L === 'undefined') {
      console.error('Leaflet not loaded or #coMap missing');
      return;
    }

    const statusEl = $id('map-status');

    /* ---- create map ---- */
    const map = L.map('coMap', {
      preferCanvas: true,
      zoomControl: true,
      minZoom: 6,
      maxZoom: 14
    });

    /* ---- panes (controls draw order) ---- */
    map.createPane('overlayPane2');   map.getPane('overlayPane2').style.zIndex = 410;
    map.createPane('pointsPane2');    map.getPane('pointsPane2').style.zIndex = 420;
    map.createPane('transportPane'); map.getPane('transportPane').style.zIndex = 215;

    /* ---- base map ---- */
    const darkBasemap = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      { attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19 }
    );
    const lightBasemap = L.tileLayer(
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      { attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19 }
    );

    // Pick basemap based on user's color-scheme preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    (prefersDark ? darkBasemap : lightBasemap).addTo(map);

    /* ---- transportation tile overlay ---- */
    const transportLayer = L.tileLayer(
      'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
      {
        attribution: '&copy; OpenStreetMap contributors',
        opacity: 0.25,
        pane: 'transportPane',
        maxZoom: 19
      }
    );

    addLegend(map);

    /* ======================================================
       STEP 1: Load state + county boundaries from us-atlas
       ====================================================== */
    setStatus(statusEl, 'Loading boundaries…', 'info');

    let coBounds;
    try {
      const [topoStates, topoCounties] = await Promise.all([
        fetchJSON(US_STATES_TOPO),
        fetchJSON(US_COUNTIES_TOPO)
      ]);

      const statesFC   = topojson.feature(topoStates, topoStates.objects.states);
      const countiesFC = topojson.feature(topoCounties, topoCounties.objects.counties);

      // Colorado FIPS = 08
      const coStateFC = {
        type: 'FeatureCollection',
        features: statesFC.features.filter(f => String(f.id).padStart(2, '0') === '08')
      };
      const coCountiesFC = {
        type: 'FeatureCollection',
        features: countiesFC.features.filter(f => String(f.id).padStart(5, '0').startsWith('08'))
      };

      const stateLayer = L.geoJSON(coStateFC, { style: styleState }).addTo(map);
      coBounds = stateLayer.getBounds();

      const countiesLayer = L.geoJSON(coCountiesFC, {
        style: styleCounty,
        onEachFeature: (f, layer) => {
          const name = f.properties && f.properties.name;
          if (name) layer.bindTooltip(name + ' County', { sticky: true, opacity: 0.9, offset: [5, 0] });
        }
      }).addTo(map);

      // Fit and lock to Colorado
      map.fitBounds(coBounds, { padding: [10, 10] });
      const minZ = Math.max(5, map.getBoundsZoom(coBounds.pad(0.15), true) - 0.5);
      map.setMinZoom(minZ);
      const paddedBounds = coBounds.pad(0.12);
      map.setMaxBounds(paddedBounds);
      map.options.maxBoundsViscosity = 1.0;

      // Wire county checkbox
      const chkCounties = $id('layerCounties');
      if (chkCounties) {
        chkCounties.addEventListener('change', () => {
          chkCounties.checked ? countiesLayer.addTo(map) : map.removeLayer(countiesLayer);
        });
      }

      setStatus(statusEl, 'Boundaries loaded', 'ok');
    } catch (e) {
      console.error('Boundary load failed:', e);
      setStatus(statusEl, 'Boundary load failed: ' + e.message, 'err');
      // Still try to set a Colorado default view
      map.setView([39.0, -105.5], 7);
    }

    /* ======================================================
       STEP 2: Places (Colorado municipalities)
       ====================================================== */
    let placesLayer = null;
    async function loadPlaces() {
      try {
        setStatus(statusEl, 'Loading places…', 'info');
        const gj = await arcgisQuery(
          CO_PLACES_URL,
          "STATE='08'",
          'NAME,LSAD,FUNCSTAT,ALAND'
        );
        placesLayer = L.geoJSON(gj, {
          style: stylePlace,
          onEachFeature: (f, layer) => {
            const p = f.properties || {};
            const name = p.NAME || p.NAMELSAD || '';
            if (name) layer.bindTooltip(name, { sticky: true, opacity: 0.88, offset: [5, 0] });
          }
        });

        const chkPlaces = $id('layerPlaces');
        if (chkPlaces) {
          if (chkPlaces.checked) placesLayer.addTo(map);
          chkPlaces.addEventListener('change', () => {
            chkPlaces.checked ? placesLayer.addTo(map) : map.removeLayer(placesLayer);
          });
        }
        setStatus(statusEl, `Places loaded (${gj.features.length})`, 'ok');
      } catch (e) {
        console.warn('Places load failed, trying fallback…', e);
        // Fallback: Colorado Basemap service
        try {
          const gj2 = await arcgisQuery(
            'https://gis.colorado.gov/public/rest/services/OIT/Colorado_State_Basemap/MapServer/34',
            '1=1',
            'NAME10,NAMELSAD10,GEOID10'
          );
          placesLayer = L.geoJSON(gj2, {
            style: stylePlace,
            onEachFeature: (f, layer) => {
              const name = (f.properties && (f.properties.NAMELSAD10 || f.properties.NAME10)) || '';
              if (name) layer.bindTooltip(name, { sticky: true, opacity: 0.88 });
            }
          });
          const chkPlaces = $id('layerPlaces');
          if (chkPlaces && chkPlaces.checked) placesLayer.addTo(map);
          if (chkPlaces) chkPlaces.addEventListener('change', () => {
            chkPlaces.checked ? placesLayer.addTo(map) : map.removeLayer(placesLayer);
          });
          setStatus(statusEl, `Places loaded (fallback, ${gj2.features.length})`, 'ok');
        } catch (e2) {
          console.warn('Places fallback also failed:', e2);
        }
      }
    }

    /* ======================================================
       STEP 3: LIHTC Projects (HUD eGIS)
       ====================================================== */
    let lihtcAll = null;
    const lihtcGroup = L.layerGroup().addTo(map);

    function renderLIHTC() {
      lihtcGroup.clearLayers();
      if (!lihtcAll) return;

      const onlyQCT = !!$id('filterQCT')?.checked;
      const onlyDDA = !!$id('filterDDA')?.checked;
      let shown = 0;

      for (const f of (lihtcAll.features || [])) {
        const p = f.properties || {};
        if (onlyQCT && !(p.QCT === 1 || p.QCT === '1' || p.QCT === 'Y')) continue;
        if (onlyDDA && !(p.DDA === 1 || p.DDA === '1' || p.DDA === 'Y')) continue;

        const coords = f.geometry?.type === 'Point' ? f.geometry.coordinates : null;
        if (!coords || !coords[0] || !coords[1]) continue;

        const marker = L.circleMarker([coords[1], coords[0]], {
          pane: 'pointsPane2',
          radius: 5,
          weight: 1.2,
          color: 'rgba(94,200,248,1)',
          fillColor: 'rgba(94,200,248,0.65)',
          fillOpacity: 1
        });
        marker.bindPopup(buildPopup(p), { maxWidth: 320 });
        // Hover tooltip shows project name
        const nm = p.PROJECT || p.PROJ_NM || '';
        if (nm) marker.bindTooltip(nm, { sticky: false, offset: [8, 0], opacity: 0.9 });
        marker.addTo(lihtcGroup);
        shown++;
      }

      setStatus(statusEl, `Showing ${shown} LIHTC projects`, 'ok');
    }

    async function loadLIHTC() {
      setStatus(statusEl, 'Loading LIHTC projects…', 'info');
      try {
        // Query Colorado projects by state field
        const gj = await arcgisQuery(
          HUD_LIHTC_LAYER,
          "(PROJ_ST='CO') OR (STD_ST='CO')",
          '*'
        );
        lihtcAll = gj;
        renderLIHTC();
        setStatus(statusEl, `${gj.features.length} LIHTC projects loaded`, 'ok');
      } catch (e) {
        console.error('LIHTC load failed:', e);
        setStatus(statusEl, 'LIHTC projects unavailable: ' + e.message, 'warn');
      }
    }

    /* ======================================================
       STEP 4: QCT / DDA overlays
       ====================================================== */
    let qctLayer = null, ddaLayer = null;
    let qctLoaded = false, ddaLoaded = false;

    async function tryLoadOverlay(primaryUrl, itemId, stateFilter, styleFn, label) {
      // Try primary URL first, then resolve via item ID
      const urls = [primaryUrl];
      try {
        const resolved = await resolveItemUrl(itemId);
        if (resolved && !urls.includes(resolved + '/0') && !urls.includes(resolved)) {
          urls.push(resolved + '/0', resolved);
        }
      } catch (_) {}

      // Common state filters to try
      const filters = [
        stateFilter,
        "(STATE_ABBR='CO')",
        "(STATE='CO')",
        "(STUSAB='CO')",
        "(STATEFP='08') OR (STATEFP10='08') OR (STATEFP20='08')",
        "1=1"  // last resort — get all and filter client-side
      ];

      for (const url of urls) {
        for (const where of filters) {
          try {
            const gj = await arcgisQuery(url, where, '*');
            if (!gj.features.length) continue;

            // If we used "1=1", filter client-side to Colorado bbox
            let features = gj.features;
            if (where === '1=1' && coBounds) {
              const bbox = coBounds.pad(0.05);
              features = features.filter(f => {
                if (!f.geometry) return false;
                // Quick bbox check on first coordinate
                const coords = f.geometry.coordinates;
                if (!coords) return false;
                // Flatten to get any coordinate
                const flat = JSON.stringify(coords).match(/-?\d+\.?\d+/g)?.map(Number) || [];
                for (let i = 0; i < flat.length - 1; i += 2) {
                  const lng = flat[i], lat = flat[i + 1];
                  if (lng > -109.5 && lng < -102 && lat > 36.8 && lat < 41.2) return true;
                }
                return false;
              });
            }

            if (!features.length) continue;
            const fc = { ...gj, features };
            const layer = L.geoJSON(fc, { pane: 'overlayPane2', style: styleFn });
            layer.bindTooltip(f => label, { sticky: true, opacity: 0.85 });
            console.log(`✓ ${label}: loaded ${features.length} features from ${url}`);
            return layer;
          } catch (e) {
            console.warn(`${label} attempt failed (${url}, ${where}):`, e.message);
          }
        }
      }
      throw new Error(`${label}: all sources exhausted`);
    }

    async function ensureQCT() {
      if (qctLoaded) return;
      qctLoaded = true;
      try {
        qctLayer = await tryLoadOverlay(
          QCT_LAYER, QCT_ITEM,
          "(STATEFP='08') OR (STATEFP10='08') OR (STATE='08')",
          styleQCT, 'QCT 2026'
        );
        setStatus(statusEl, 'QCT loaded', 'ok');
      } catch (e) {
        console.warn('QCT unavailable:', e.message);
      }
    }

    async function ensureDDA() {
      if (ddaLoaded) return;
      ddaLoaded = true;
      try {
        ddaLayer = await tryLoadOverlay(
          DDA_LAYER, DDA_ITEM,
          "(STATEFP='08') OR (STATEFP10='08') OR (STATE='08')",
          styleDDA, 'DDA 2026'
        );
        setStatus(statusEl, 'DDA loaded', 'ok');
      } catch (e) {
        console.warn('DDA unavailable:', e.message);
      }
    }

    async function syncQCT() {
      const chk = $id('layerQCT');
      if (!chk) return;
      if (chk.checked && !qctLayer) await ensureQCT();
      if (qctLayer) chk.checked ? qctLayer.addTo(map) : map.removeLayer(qctLayer);
    }

    async function syncDDA() {
      const chk = $id('layerDDA');
      if (!chk) return;
      if (chk.checked && !ddaLayer) await ensureDDA();
      if (ddaLayer) chk.checked ? ddaLayer.addTo(map) : map.removeLayer(ddaLayer);
    }

    /* ======================================================
       STEP 5: Transportation layer
       ====================================================== */
    const chkTransport = $id('layerTransport');
    if (chkTransport) {
      chkTransport.addEventListener('change', () => {
        chkTransport.checked ? transportLayer.addTo(map) : map.removeLayer(transportLayer);
      });
    }

    /* ======================================================
       WIRE CHECKBOXES
       ====================================================== */
    const filterQCT = $id('filterQCT');
    const filterDDA = $id('filterDDA');
    const chkQCT    = $id('layerQCT');
    const chkDDA    = $id('layerDDA');

    if (chkQCT)  chkQCT.addEventListener('change', syncQCT);
    if (chkDDA)  chkDDA.addEventListener('change', syncDDA);
    if (filterQCT) filterQCT.addEventListener('change', renderLIHTC);
    if (filterDDA) filterDDA.addEventListener('change', renderLIHTC);

    /* ======================================================
       KICK OFF ALL LOADS
       ====================================================== */
    // Load places + LIHTC in parallel, then overlays
    await Promise.allSettled([loadPlaces(), loadLIHTC()]);

    // Start QCT/DDA load if checked by default
    if ($id('layerQCT')?.checked) syncQCT();
    if ($id('layerDDA')?.checked) syncDDA();

    // Resize fix
    setTimeout(() => map.invalidateSize(), 300);
    window.addEventListener('resize', () => map.invalidateSize());
  }

  /* ---- entry point ---- */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

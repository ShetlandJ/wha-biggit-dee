import { resolvePlace, findUnresolved } from './places.js';

// Generation colors - warm (recent) to cool (old)
const GEN_COLORS = {
  1: '#e8e8e8',
  2: '#f0a060',
  3: '#e08040',
  4: '#d06030',
  5: '#b04828',
  6: '#884458',
  7: '#705890',
  8: '#6090c0',
};

const PANE_COLORS = ['#e08050', '#5090d0'];

let panes = [];
let placesLookup = {};
let activeGenerations = new Set([1, 2, 3, 4, 5, 6, 7, 8]);
let activeEvents = new Set(['born', 'married', 'died']);
let activeTab = 'people';
let isCompare = false;

class MapPane {
  constructor(containerId, ancestors, placesLookup, paneIndex) {
    this.containerId = containerId;
    this.ancestors = ancestors;
    this.placesLookup = placesLookup;
    this.paneIndex = paneIndex;
    this.map = null;
    this.placeMarkers = new Map();
    this.journeyLines = new Map();
    this.highlightedPerson = null;
  }

  initMap() {
    this.map = L.map(this.containerId, {
      center: [60.25, -1.25],
      zoom: 9,
      zoomControl: this.paneIndex === 0,
      attributionControl: this.paneIndex === 0,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 17,
    }).addTo(this.map);
  }

  render() {
    this.clearMap();
    this.renderPlaceMarkers();
    this.renderJourneyLines();
  }

  clearMap() {
    this.placeMarkers.forEach(({ marker, circle }) => {
      if (marker) this.map.removeLayer(marker);
      if (circle) this.map.removeLayer(circle);
    });
    this.placeMarkers.clear();
    this.journeyLines.forEach(line => this.map.removeLayer(line));
    this.journeyLines.clear();
  }

  renderPlaceMarkers() {
    const placeEvents = new Map();

    for (const person of this.ancestors) {
      if (!activeGenerations.has(person.generation)) continue;
      for (const event of person.events) {
        if (!activeEvents.has(event.type)) continue;
        if (!event.place || event.place === 'UNKNOWN') continue;
        const resolved = resolvePlace(event.place, this.placesLookup);
        if (!resolved) continue;
        const key = resolved.matchedKey;
        if (!placeEvents.has(key)) {
          placeEvents.set(key, { lat: resolved.lat, lng: resolved.lng, events: [] });
        }
        placeEvents.get(key).events.push({ type: event.type, date: event.date, place: event.place, person });
      }
    }

    for (const [key, data] of placeEvents) {
      const count = data.events.length;
      const radius = Math.max(6, Math.min(20, 4 + count * 1.5));
      const circle = L.circleMarker([data.lat, data.lng], {
        radius,
        fillColor: '#888',
        fillOpacity: 0.25,
        color: '#aaa',
        weight: 1,
        opacity: 0.4,
      }).addTo(this.map);

      circle.bindTooltip(key, { className: 'place-tooltip', direction: 'top', offset: [0, -radius] });
      circle.on('click', () => showPlaceInfo(key, data, this));
      this.placeMarkers.set(key, { marker: null, circle, events: data.events });
    }
  }

  renderJourneyLines() {
    for (const person of this.ancestors) {
      if (!activeGenerations.has(person.generation)) continue;
      const points = [];
      for (const event of person.events) {
        if (!event.place || event.place === 'UNKNOWN') continue;
        const resolved = resolvePlace(event.place, this.placesLookup);
        if (resolved && resolved.precision !== 'county') {
          points.push({ lat: resolved.lat, lng: resolved.lng, type: event.type });
        }
      }
      if (points.length < 2) continue;
      const hasDistinct = points.some((p, i) =>
        i > 0 && (Math.abs(p.lat - points[i-1].lat) > 0.001 || Math.abs(p.lng - points[i-1].lng) > 0.001)
      );
      if (!hasDistinct) continue;

      const latlngs = points.map(p => [p.lat, p.lng]);
      const color = GEN_COLORS[person.generation] || '#888';
      const line = L.polyline(latlngs, {
        color,
        weight: 1.5,
        opacity: this.highlightedPerson === person.ahnentafel ? 0.9 : 0.2,
        dashArray: this.highlightedPerson === person.ahnentafel ? null : '4 4',
      }).addTo(this.map);

      line.on('click', () => highlightPerson(person.ahnentafel, this));
      this.journeyLines.set(person.ahnentafel, line);
    }
  }

  highlightAncestor(ahnentafel) {
    this.highlightedPerson = ahnentafel;
    const person = this.ancestors.find(a => a.ahnentafel === ahnentafel);

    this.journeyLines.forEach((line, ahn) => {
      line.setStyle({
        opacity: ahn === ahnentafel ? 0.9 : 0.07,
        weight: ahn === ahnentafel ? 3 : 1.5,
        dashArray: ahn === ahnentafel ? null : '4 4',
      });
    });

    if (person) {
      const personPlaces = new Set();
      for (const event of person.events) {
        if (event.place) {
          const resolved = resolvePlace(event.place, this.placesLookup);
          if (resolved) personPlaces.add(resolved.matchedKey);
        }
      }
      this.placeMarkers.forEach(({ circle }, key) => {
        circle.setStyle({
          fillOpacity: personPlaces.has(key) ? 0.6 : 0.08,
          opacity: personPlaces.has(key) ? 0.8 : 0.15,
        });
      });
    }

    // Fit map to person's journey
    if (person) {
      const bounds = [];
      for (const event of person.events) {
        if (event.place) {
          const resolved = resolvePlace(event.place, this.placesLookup);
          if (resolved && resolved.precision !== 'county') bounds.push([resolved.lat, resolved.lng]);
        }
      }
      if (bounds.length > 1) {
        this.map.fitBounds(bounds, { padding: [80, 80], maxZoom: 12 });
      } else if (bounds.length === 1) {
        this.map.setView(bounds[0], 11);
      }
    }
  }

  clearHighlightState() {
    this.highlightedPerson = null;
    this.journeyLines.forEach(line => {
      line.setStyle({ opacity: 0.2, weight: 1.5, dashArray: '4 4' });
    });
    this.placeMarkers.forEach(({ circle }) => {
      circle.setStyle({ fillOpacity: 0.25, opacity: 0.4 });
    });
  }
}

// --- Init ---

async function init() {
  const params = new URLSearchParams(window.location.search);
  const idParam = params.get('id') || 'I210520';
  const personIDs = idParam.split('/').filter(Boolean);
  isCompare = personIDs.length === 2;

  const dataFiles = personIDs.map(id =>
    id === 'I210520' ? './data/ancestors.json' : `./data/ancestors_${id}.json`
  );

  const [placesData, ...ancestorDatasets] = await Promise.all([
    fetch('./data/places.json').then(r => r.json()),
    ...dataFiles.map(f => fetch(f).then(r => {
      if (!r.ok) throw new Error(`No data file: ${f}`);
      return r.json();
    })),
  ]).catch(err => {
    document.getElementById('root-person').innerHTML = `<div class="name">Person not found</div><div>${err.message}</div>`;
    throw err;
  });

  placesLookup = placesData.places;

  // Report unresolved
  for (const dataset of ancestorDatasets) {
    const unresolved = findUnresolved(dataset, placesLookup);
    if (unresolved.length > 0) console.log('Unresolved places:', unresolved);
  }

  if (isCompare) {
    document.body.classList.add('compare-mode');
    const container = document.getElementById('map-container');
    container.classList.add('split');
    container.innerHTML = ancestorDatasets.map((_, i) => {
      const root = ancestorDatasets[i].find(a => a.ahnentafel === 1);
      const name = root?.name || 'Unknown';
      return `<div class="map-pane">
        <div class="map-label" style="border-top-color: ${PANE_COLORS[i]}">${name}</div>
        <div id="map-${i}" class="map-view"></div>
      </div>`;
    }).join('');

    panes = ancestorDatasets.map((data, i) => {
      const pane = new MapPane(`map-${i}`, data, placesLookup, i);
      pane.initMap();
      return pane;
    });

    syncMapViews(panes[0].map, panes[1].map);
  } else {
    panes = [new MapPane('map', ancestorDatasets[0], placesLookup, 0)];
    panes[0].initMap();
  }

  initSidebar();
  render();
}

function syncMapViews(mapA, mapB) {
  let syncing = false;
  function sync(source, target) {
    if (syncing) return;
    syncing = true;
    target.setView(source.getCenter(), source.getZoom(), { animate: false });
    syncing = false;
  }
  mapA.on('moveend', () => sync(mapA, mapB));
  mapB.on('moveend', () => sync(mapB, mapA));
}

// --- Sidebar ---

function initSidebar() {
  // Root person(s)
  const rootEl = document.getElementById('root-person');
  if (isCompare) {
    rootEl.innerHTML = panes.map((pane, i) => {
      const root = pane.ancestors.find(a => a.ahnentafel === 1);
      const year = root?.events.find(e => e.type === 'born')?.date?.match(/\d{4}/)?.[0] || '';
      return `<div style="border-left: 3px solid ${PANE_COLORS[i]}; padding-left: 8px; ${i > 0 ? 'margin-top: 8px' : ''}">
        <div class="name">${root?.name || 'Unknown'}</div>
        <div>b. ${year} &middot; ${pane.ancestors.length} ancestors</div>
      </div>`;
    }).join('');
  } else {
    const root = panes[0].ancestors.find(a => a.ahnentafel === 1);
    if (root) {
      const year = root.events.find(e => e.type === 'born')?.date?.match(/\d{4}/)?.[0] || '';
      rootEl.innerHTML = `
        <div class="name">${root.name}</div>
        <div>b. ${year} &middot; ${panes[0].ancestors.length} ancestors &middot; 8 generations</div>
      `;
    }
  }

  // Generation checkboxes
  const genContainer = document.getElementById('gen-checkboxes');
  for (let g = 1; g <= 8; g++) {
    const btn = document.createElement('div');
    btn.className = 'gen-btn active';
    btn.textContent = g;
    btn.style.setProperty('--gen-color', GEN_COLORS[g]);
    btn.dataset.gen = g;
    btn.addEventListener('click', () => {
      if (activeGenerations.has(g)) {
        activeGenerations.delete(g);
        btn.classList.remove('active');
      } else {
        activeGenerations.add(g);
        btn.classList.add('active');
      }
      render();
    });
    genContainer.appendChild(btn);
  }

  // Event filter
  document.querySelectorAll('#event-filter input').forEach(cb => {
    cb.addEventListener('change', () => {
      const type = cb.dataset.event;
      if (cb.checked) activeEvents.add(type);
      else activeEvents.delete(type);
      render();
    });
  });

  // Tab switching
  document.querySelectorAll('.list-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      document.querySelectorAll('.list-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === activeTab));
      document.getElementById('people').classList.toggle('hidden', activeTab !== 'people');
      document.getElementById('surnames').classList.toggle('hidden', activeTab !== 'surnames');
    });
  });

  // Info panel close
  document.getElementById('info-close').addEventListener('click', () => {
    document.getElementById('info-panel').classList.add('hidden');
    clearHighlight();
  });
}

// --- Render ---

function render() {
  panes.forEach(p => p.render());
  renderPersonList();
  renderSurnameList();
}

function renderPersonList() {
  const container = document.getElementById('people');

  if (isCompare) {
    // Merge both pane datasets
    const items = [];
    panes.forEach((pane, pi) => {
      const visible = pane.ancestors.filter(a => activeGenerations.has(a.generation));
      for (const person of visible) {
        items.push({ person, paneIndex: pi });
      }
    });

    items.sort((a, b) => a.person.generation - b.person.generation || a.person.ahnentafel - b.person.ahnentafel);
    document.getElementById('person-count').textContent = `(${items.length})`;

    container.innerHTML = items.map(({ person, paneIndex }) => {
      const yearMatch = person.events.find(e => e.type === 'born')?.date?.match(/\d{4}/);
      const year = yearMatch ? yearMatch[0] : '?';
      const color = GEN_COLORS[person.generation];
      return `<div class="person-item" style="--gen-color: ${color}" data-ahn="${person.ahnentafel}" data-pane="${paneIndex}">
        <span class="pane-dot" style="background:${PANE_COLORS[paneIndex]}"></span>
        <span class="person-name">${person.name}</span>
        <span class="person-year">${year}</span>
      </div>`;
    }).join('');

    container.querySelectorAll('.person-item').forEach(el => {
      el.addEventListener('click', () => {
        const ahn = parseInt(el.dataset.ahn);
        const pi = parseInt(el.dataset.pane);
        highlightPerson(ahn, panes[pi]);
      });
    });
  } else {
    const visible = panes[0].ancestors.filter(a => activeGenerations.has(a.generation));
    document.getElementById('person-count').textContent = `(${visible.length})`;
    visible.sort((a, b) => a.generation - b.generation || a.ahnentafel - b.ahnentafel);

    container.innerHTML = visible.map(person => {
      const yearMatch = person.events.find(e => e.type === 'born')?.date?.match(/\d{4}/);
      const year = yearMatch ? yearMatch[0] : '?';
      const isHighlighted = panes[0].highlightedPerson === person.ahnentafel;
      const color = GEN_COLORS[person.generation];
      return `<div class="person-item ${isHighlighted ? 'highlighted' : ''}" style="--gen-color: ${color}" data-ahn="${person.ahnentafel}">
        <span class="person-name">${person.name}</span>
        <span class="person-year">${year}</span>
      </div>`;
    }).join('');

    container.querySelectorAll('.person-item').forEach(el => {
      el.addEventListener('click', () => {
        highlightPerson(parseInt(el.dataset.ahn), panes[0]);
      });
    });
  }
}

function renderSurnameList() {
  const container = document.getElementById('surnames');

  if (isCompare) {
    // Gather counts per pane
    const allCounts = panes.map(pane => {
      const counts = new Map();
      const visible = pane.ancestors.filter(a => activeGenerations.has(a.generation));
      for (const a of visible) {
        if (a.name === 'Living') continue;
        const parts = a.name.split(/\s+/);
        const surname = parts.filter(p => p === p.toUpperCase() && /^[A-Z]+$/.test(p)).join(' ');
        if (!surname) continue;
        counts.set(surname, (counts.get(surname) || 0) + 1);
      }
      return counts;
    });

    // Merge into combined list
    const combined = new Map();
    allCounts.forEach((counts, pi) => {
      for (const [name, count] of counts) {
        if (!combined.has(name)) combined.set(name, [0, 0]);
        combined.get(name)[pi] = count;
      }
    });

    const sorted = [...combined.entries()].sort((a, b) => {
      const totalA = a[1][0] + a[1][1];
      const totalB = b[1][0] + b[1][1];
      return totalB - totalA;
    });

    const max = sorted.length > 0 ? Math.max(...sorted.map(([, c]) => c[0] + c[1])) : 1;

    container.innerHTML = sorted.map(([name, counts], i) => {
      const pctA = (counts[0] / max) * 100;
      const pctB = (counts[1] / max) * 100;
      return `<div class="surname-item">
        <span class="surname-rank">${i + 1}</span>
        <span class="surname-name">${name}</span>
        <span class="surname-bar-wrap">
          <span class="surname-bar" style="width:${pctA}%;background:${PANE_COLORS[0]}"></span>
          <span class="surname-bar surname-bar-b" style="width:${pctB}%;background:${PANE_COLORS[1]}"></span>
        </span>
        <span class="surname-count">${counts[0] + counts[1]}</span>
      </div>`;
    }).join('');
  } else {
    const visible = panes[0].ancestors.filter(a => activeGenerations.has(a.generation));
    const counts = new Map();
    for (const a of visible) {
      if (a.name === 'Living') continue;
      const parts = a.name.split(/\s+/);
      const surname = parts.filter(p => p === p.toUpperCase() && /^[A-Z]+$/.test(p)).join(' ');
      if (!surname) continue;
      counts.set(surname, (counts.get(surname) || 0) + 1);
    }
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const max = sorted.length > 0 ? sorted[0][1] : 1;

    container.innerHTML = sorted.map(([name, count], i) => {
      const pct = (count / max) * 100;
      return `<div class="surname-item">
        <span class="surname-rank">${i + 1}</span>
        <span class="surname-name">${name}</span>
        <span class="surname-bar-wrap"><span class="surname-bar" style="width:${pct}%"></span></span>
        <span class="surname-count">${count}</span>
      </div>`;
    }).join('');
  }
}

// --- Highlight / Info ---

function highlightPerson(ahnentafel, sourcePane) {
  // Toggle off if same person
  if (sourcePane.highlightedPerson === ahnentafel) {
    clearHighlight();
    return;
  }

  // Clear all panes first
  panes.forEach(p => p.clearHighlightState());

  // Highlight in source pane
  sourcePane.highlightAncestor(ahnentafel);

  // In compare mode, check if same pID exists in other pane
  if (isCompare) {
    const person = sourcePane.ancestors.find(a => a.ahnentafel === ahnentafel);
    if (person) {
      for (const otherPane of panes) {
        if (otherPane === sourcePane) continue;
        const match = otherPane.ancestors.find(a => a.pID === person.pID);
        if (match) otherPane.highlightAncestor(match.ahnentafel);
      }
    }
  }

  // Show info panel
  const person = sourcePane.ancestors.find(a => a.ahnentafel === ahnentafel);
  if (person) showPersonInfo(person, sourcePane);

  // Update sidebar highlighting
  document.querySelectorAll('.person-item').forEach(el => {
    const elAhn = parseInt(el.dataset.ahn);
    const elPane = parseInt(el.dataset.pane || '0');
    el.classList.toggle('highlighted', elAhn === ahnentafel && elPane === sourcePane.paneIndex);
  });
}

function clearHighlight() {
  panes.forEach(p => p.clearHighlightState());
  document.querySelectorAll('.person-item').forEach(el => el.classList.remove('highlighted'));
  document.getElementById('info-panel').classList.add('hidden');
}

function showPlaceInfo(key, data, sourcePane) {
  const panel = document.getElementById('info-panel');
  const content = document.getElementById('info-content');

  const grouped = { born: [], married: [], died: [] };
  for (const ev of data.events) {
    if (grouped[ev.type]) grouped[ev.type].push(ev);
  }

  let html = `<h4>${key}</h4>`;
  html += `<div class="info-place">${data.events.length} events</div>`;

  for (const [type, events] of Object.entries(grouped)) {
    if (events.length === 0) continue;
    const label = type === 'born' ? 'Births' : type === 'married' ? 'Marriages' : 'Deaths';
    html += `<div style="margin-bottom:8px"><strong style="color:#999;font-size:11px;text-transform:uppercase">${label}</strong></div>`;

    events.sort((a, b) => {
      const ya = parseInt(a.date?.match(/\d{4}/)?.[0] || '0');
      const yb = parseInt(b.date?.match(/\d{4}/)?.[0] || '0');
      return ya - yb;
    });

    const seen = new Set();
    const deduped = events.filter(ev => {
      const k = `${ev.person.pID || ev.person.ahnentafel}-${ev.date}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    for (const ev of deduped) {
      html += `<div class="info-event">
        <div class="event-type ${type}"></div>
        <div class="event-detail">
          <span class="event-person" data-ahn="${ev.person.ahnentafel}" data-pane="${sourcePane.paneIndex}">${ev.person.name}</span>
          <div class="event-date">${ev.date || ''}</div>
        </div>
      </div>`;
    }
  }

  content.innerHTML = html;
  panel.classList.remove('hidden');

  content.querySelectorAll('.event-person').forEach(el => {
    el.addEventListener('click', () => {
      const ahn = parseInt(el.dataset.ahn);
      const pi = parseInt(el.dataset.pane || '0');
      highlightPerson(ahn, panes[pi]);
    });
  });
}

function showPersonInfo(person, sourcePane) {
  const panel = document.getElementById('info-panel');
  const content = document.getElementById('info-content');

  const color = GEN_COLORS[person.generation];
  let html = `<h4 style="border-left: 3px solid ${color}; padding-left: 8px">${person.name}</h4>`;
  html += `<div class="info-place">Generation ${person.generation} &middot; #${person.ahnentafel}</div>`;

  const relationship = getRelationship(person.ahnentafel);
  if (relationship) {
    html += `<div style="font-size:12px;color:#999;margin-bottom:12px">${relationship}</div>`;
  }

  html += '<div class="journey-info">';
  for (const event of person.events) {
    const place = event.place || 'Unknown';
    const label = event.type === 'born' ? 'Born' : event.type === 'married' ? 'Married' : 'Died';
    html += `<div class="journey-step ${event.type}">
      <strong>${label}</strong> ${event.date || ''}${place !== 'Unknown' ? '<br>' + place : ''}
    </div>`;
  }
  html += '</div>';

  const fatherAhn = person.ahnentafel * 2;
  const motherAhn = person.ahnentafel * 2 + 1;
  const father = sourcePane.ancestors.find(a => a.ahnentafel === fatherAhn);
  const mother = sourcePane.ancestors.find(a => a.ahnentafel === motherAhn);

  if (father || mother) {
    html += '<div style="margin-top:12px;font-size:12px;color:#888">';
    if (father) {
      html += `<div>Father: <span class="event-person" data-ahn="${fatherAhn}" data-pane="${sourcePane.paneIndex}" style="color:#ddd;cursor:pointer">${father.name}</span></div>`;
    }
    if (mother) {
      html += `<div>Mother: <span class="event-person" data-ahn="${motherAhn}" data-pane="${sourcePane.paneIndex}" style="color:#ddd;cursor:pointer">${mother.name}</span></div>`;
    }
    html += '</div>';
  }

  if (person.pID) {
    html += `<div style="margin-top:12px"><a href="https://www.bayanne.info/Shetland/getperson.php?personID=${person.pID}&tree=ID1" target="_blank" rel="noopener" style="color:#7ab;font-size:12px;text-decoration:none">View on Bayanne &rarr;</a></div>`;
  }

  content.innerHTML = html;
  panel.classList.remove('hidden');

  content.querySelectorAll('.event-person').forEach(el => {
    el.addEventListener('click', () => {
      const ahn = parseInt(el.dataset.ahn);
      const pi = parseInt(el.dataset.pane || '0');
      highlightPerson(ahn, panes[pi]);
    });
  });
}

function getRelationship(ahnentafel) {
  if (ahnentafel === 1) return 'Root person';
  if (ahnentafel === 2) return 'Father';
  if (ahnentafel === 3) return 'Mother';

  const path = [];
  let n = ahnentafel;
  while (n > 1) {
    path.unshift(n % 2 === 0 ? 'father' : 'mother');
    n = Math.floor(n / 2);
  }

  const gen = path.length;
  const greats = gen - 2;

  if (greats <= 0) return path.join("'s ");

  const parentType = path[path.length - 1] === 'father' ? 'grandfather' : 'grandmother';
  if (greats === 1) return `Great-${parentType}`;

  const prefix = greats === 2 ? '2nd great' : greats === 3 ? '3rd great' : `${greats}th great`;
  return `${prefix}-${parentType}`;
}

init();

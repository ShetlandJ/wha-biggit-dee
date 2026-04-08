import { resolvePlace, findUnresolved } from './places.js';

// Generation colors - warm (recent) to cool (old)
const GEN_COLORS = {
  1: '#e8e8e8',
  2: '#f0a060',
  3: '#e08040',
  4: '#d06030',
  5: '#b04828',
  6: '#884030',
  7: '#604038',
  8: '#484040',
};

let map;
let ancestors = [];
let placesLookup = {};
let placeMarkers = new Map();  // key -> { marker, circle, events[] }
let journeyLines = new Map();  // ahnentafel -> polyline
let activeGenerations = new Set([1, 2, 3, 4, 5, 6, 7, 8]);
let activeEvents = new Set(['born', 'married', 'died']);
let highlightedPerson = null;

async function init() {
  // Determine which person to load from URL param
  const params = new URLSearchParams(window.location.search);
  const personID = params.get('id') || 'I210520';
  const dataFile = personID === 'I210520'
    ? './data/ancestors.json'
    : `./data/ancestors_${personID}.json`;

  // Load data
  const [ancestorData, placesData] = await Promise.all([
    fetch(dataFile).then(r => {
      if (!r.ok) throw new Error(`No data for ${personID}`);
      return r.json();
    }),
    fetch('./data/places.json').then(r => r.json()),
  ]).catch(err => {
    document.getElementById('root-person').innerHTML = `<div class="name">Person not found</div><div>No data for ${personID}</div>`;
    throw err;
  });

  ancestors = ancestorData;
  placesLookup = placesData.places;

  // Report unresolved places
  const unresolved = findUnresolved(ancestors, placesLookup);
  if (unresolved.length > 0) {
    console.log('Unresolved places:', unresolved);
  }

  initMap();
  initSidebar();
  render();
}

function initMap() {
  map = L.map('map', {
    center: [60.25, -1.25],
    zoom: 9,
    zoomControl: true,
    attributionControl: true,
  });

  // Dark-ish map tiles
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 17,
  }).addTo(map);
}

function initSidebar() {
  // Root person
  const root = ancestors.find(a => a.ahnentafel === 1);
  if (root) {
    const birthEvent = root.events.find(e => e.type === 'born');
    const year = birthEvent ? birthEvent.date.match(/\d{4}/)?.[0] : '';
    document.getElementById('root-person').innerHTML = `
      <div class="name">${root.name}</div>
      <div>b. ${year} &middot; ${ancestors.length} ancestors &middot; 8 generations</div>
    `;
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

  // Info panel close
  document.getElementById('info-close').addEventListener('click', () => {
    document.getElementById('info-panel').classList.add('hidden');
    clearHighlight();
  });
}

function render() {
  clearMap();
  renderPlaceMarkers();
  renderJourneyLines();
  renderPersonList();
}

function clearMap() {
  placeMarkers.forEach(({ marker, circle }) => {
    if (marker) map.removeLayer(marker);
    if (circle) map.removeLayer(circle);
  });
  placeMarkers.clear();

  journeyLines.forEach(line => map.removeLayer(line));
  journeyLines.clear();
}

function renderPlaceMarkers() {
  // Group events by resolved place
  const placeEvents = new Map(); // matchedKey -> { lat, lng, events[] }

  for (const person of ancestors) {
    if (!activeGenerations.has(person.generation)) continue;

    for (const event of person.events) {
      if (!activeEvents.has(event.type)) continue;
      if (!event.place || event.place === 'UNKNOWN') continue;

      const resolved = resolvePlace(event.place, placesLookup);
      if (!resolved) continue;

      const key = resolved.matchedKey;
      if (!placeEvents.has(key)) {
        placeEvents.set(key, { lat: resolved.lat, lng: resolved.lng, events: [] });
      }
      placeEvents.get(key).events.push({
        type: event.type,
        date: event.date,
        place: event.place,
        person,
      });
    }
  }

  // Create markers
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
    }).addTo(map);

    // Tooltip
    circle.bindTooltip(key, {
      className: 'place-tooltip',
      direction: 'top',
      offset: [0, -radius],
    });

    // Click handler
    circle.on('click', () => showPlaceInfo(key, data));

    placeMarkers.set(key, { marker: null, circle, events: data.events });
  }
}

function renderJourneyLines() {
  for (const person of ancestors) {
    if (!activeGenerations.has(person.generation)) continue;

    const points = [];
    for (const event of person.events) {
      if (!event.place || event.place === 'UNKNOWN') continue;
      const resolved = resolvePlace(event.place, placesLookup);
      if (resolved && resolved.precision !== 'county') {
        points.push({ lat: resolved.lat, lng: resolved.lng, type: event.type });
      }
    }

    // Only draw if there are at least 2 distinct locations
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
      opacity: highlightedPerson === person.ahnentafel ? 0.9 : 0.2,
      dashArray: highlightedPerson === person.ahnentafel ? null : '4 4',
    }).addTo(map);

    line.on('click', () => highlightPerson(person.ahnentafel));

    journeyLines.set(person.ahnentafel, line);
  }
}

function renderPersonList() {
  const container = document.getElementById('people');
  const visible = ancestors.filter(a => activeGenerations.has(a.generation));

  document.getElementById('person-count').textContent = `(${visible.length})`;

  // Sort by generation then ahnentafel
  visible.sort((a, b) => a.generation - b.generation || a.ahnentafel - b.ahnentafel);

  container.innerHTML = visible.map(person => {
    const yearMatch = person.events.find(e => e.type === 'born')?.date?.match(/\d{4}/);
    const year = yearMatch ? yearMatch[0] : '?';
    const isHighlighted = highlightedPerson === person.ahnentafel;
    const color = GEN_COLORS[person.generation];

    return `<div class="person-item ${isHighlighted ? 'highlighted' : ''}"
                 style="--gen-color: ${color}"
                 data-ahn="${person.ahnentafel}">
      <span class="person-name">${person.name}</span>
      <span class="person-year">${year}</span>
    </div>`;
  }).join('');

  // Click handlers
  container.querySelectorAll('.person-item').forEach(el => {
    el.addEventListener('click', () => {
      const ahn = parseInt(el.dataset.ahn);
      highlightPerson(ahn);
    });
  });
}

function highlightPerson(ahnentafel) {
  if (highlightedPerson === ahnentafel) {
    clearHighlight();
    return;
  }

  highlightedPerson = ahnentafel;
  const person = ancestors.find(a => a.ahnentafel === ahnentafel);
  if (!person) return;

  // Update journey line opacities
  journeyLines.forEach((line, ahn) => {
    line.setStyle({
      opacity: ahn === ahnentafel ? 0.9 : 0.07,
      weight: ahn === ahnentafel ? 3 : 1.5,
      dashArray: ahn === ahnentafel ? null : '4 4',
    });
  });

  // Update place marker opacities
  const personPlaces = new Set();
  for (const event of person.events) {
    if (event.place) {
      const resolved = resolvePlace(event.place, placesLookup);
      if (resolved) personPlaces.add(resolved.matchedKey);
    }
  }

  placeMarkers.forEach(({ circle }, key) => {
    circle.setStyle({
      fillOpacity: personPlaces.has(key) ? 0.6 : 0.08,
      opacity: personPlaces.has(key) ? 0.8 : 0.15,
    });
  });

  // Show info panel
  showPersonInfo(person);

  // Fit map to person's journey
  const bounds = [];
  for (const event of person.events) {
    if (event.place) {
      const resolved = resolvePlace(event.place, placesLookup);
      if (resolved && resolved.precision !== 'county') {
        bounds.push([resolved.lat, resolved.lng]);
      }
    }
  }
  if (bounds.length > 1) {
    map.fitBounds(bounds, { padding: [80, 80], maxZoom: 12 });
  } else if (bounds.length === 1) {
    map.setView(bounds[0], 11);
  }

  // Update person list highlighting
  document.querySelectorAll('.person-item').forEach(el => {
    el.classList.toggle('highlighted', parseInt(el.dataset.ahn) === ahnentafel);
  });
}

function clearHighlight() {
  highlightedPerson = null;

  journeyLines.forEach(line => {
    line.setStyle({ opacity: 0.2, weight: 1.5, dashArray: '4 4' });
  });

  placeMarkers.forEach(({ circle }) => {
    circle.setStyle({ fillOpacity: 0.25, opacity: 0.4 });
  });

  document.querySelectorAll('.person-item').forEach(el => {
    el.classList.remove('highlighted');
  });

  document.getElementById('info-panel').classList.add('hidden');
}

function showPlaceInfo(key, data) {
  const panel = document.getElementById('info-panel');
  const content = document.getElementById('info-content');

  // Group events by type
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

    // Sort by date
    events.sort((a, b) => {
      const ya = parseInt(a.date.match(/\d{4}/)?.[0] || '0');
      const yb = parseInt(b.date.match(/\d{4}/)?.[0] || '0');
      return ya - yb;
    });

    // Deduplicate same pID at same place
    const seen = new Set();
    const deduped = events.filter(ev => {
      const key = `${ev.person.pID || ev.person.ahnentafel}-${ev.date}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    for (const ev of deduped) {
      html += `<div class="info-event">
        <div class="event-type ${type}"></div>
        <div class="event-detail">
          <span class="event-person" data-ahn="${ev.person.ahnentafel}">${ev.person.name}</span>
          <div class="event-date">${ev.date}</div>
        </div>
      </div>`;
    }
  }

  content.innerHTML = html;
  panel.classList.remove('hidden');

  // Click handlers for person names
  content.querySelectorAll('.event-person').forEach(el => {
    el.addEventListener('click', () => {
      highlightPerson(parseInt(el.dataset.ahn));
    });
  });
}

function showPersonInfo(person) {
  const panel = document.getElementById('info-panel');
  const content = document.getElementById('info-content');

  const color = GEN_COLORS[person.generation];

  let html = `<h4 style="border-left: 3px solid ${color}; padding-left: 8px">${person.name}</h4>`;
  html += `<div class="info-place">Generation ${person.generation} &middot; #${person.ahnentafel}</div>`;

  // Relationship to root
  const relationship = getRelationship(person.ahnentafel);
  if (relationship) {
    html += `<div style="font-size:12px;color:#999;margin-bottom:12px">${relationship}</div>`;
  }

  html += '<div class="journey-info">';
  for (const event of person.events) {
    const place = event.place || 'Unknown';
    const label = event.type === 'born' ? 'Born' : event.type === 'married' ? 'Married' : 'Died';
    html += `<div class="journey-step ${event.type}">
      <strong>${label}</strong> ${event.date}${place !== 'Unknown' ? '<br>' + place : ''}
    </div>`;
  }
  html += '</div>';

  // Parents link
  const fatherAhn = person.ahnentafel * 2;
  const motherAhn = person.ahnentafel * 2 + 1;
  const father = ancestors.find(a => a.ahnentafel === fatherAhn);
  const mother = ancestors.find(a => a.ahnentafel === motherAhn);

  if (father || mother) {
    html += '<div style="margin-top:12px;font-size:12px;color:#888">';
    if (father) {
      html += `<div>Father: <span class="event-person" data-ahn="${fatherAhn}" style="color:#ddd;cursor:pointer">${father.name}</span></div>`;
    }
    if (mother) {
      html += `<div>Mother: <span class="event-person" data-ahn="${motherAhn}" style="color:#ddd;cursor:pointer">${mother.name}</span></div>`;
    }
    html += '</div>';
  }

  // Bayanne link
  if (person.pID) {
    html += `<div style="margin-top:12px"><a href="https://www.bayanne.info/Shetland/getperson.php?personID=${person.pID}&tree=ID1" target="_blank" rel="noopener" style="color:#7ab;font-size:12px;text-decoration:none">View on Bayanne &rarr;</a></div>`;
  }

  content.innerHTML = html;
  panel.classList.remove('hidden');

  content.querySelectorAll('.event-person').forEach(el => {
    el.addEventListener('click', () => {
      highlightPerson(parseInt(el.dataset.ahn));
    });
  });
}

function getRelationship(ahnentafel) {
  if (ahnentafel === 1) return 'Root person';
  if (ahnentafel === 2) return 'Father';
  if (ahnentafel === 3) return 'Mother';

  // Build path from root
  const path = [];
  let n = ahnentafel;
  while (n > 1) {
    path.unshift(n % 2 === 0 ? 'father' : 'mother');
    n = Math.floor(n / 2);
  }

  // Convert to readable
  const gen = path.length;
  const greats = gen - 2;

  if (greats <= 0) {
    // Gen 2 = parent, handled above
    return path.join("'s ");
  }

  const parentType = path[path.length - 1] === 'father' ? 'grandfather' : 'grandmother';

  if (greats === 1) {
    return `Great-${parentType}`;
  }

  const prefix = greats === 2 ? '2nd great' : greats === 3 ? '3rd great' : `${greats}th great`;
  return `${prefix}-${parentType}`;
}

init();

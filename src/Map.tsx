import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Moon, Navigation, Sun } from 'lucide-react';
import { CENTER, NEIGHBORHOODS, type Coords, type House } from './model';
import type { SearchResult } from './geocode';

export type View = Coords & { zoom: number };
type Props = {
  houses: House[]; selectedId: string | null; savedIds: string[];
  onSelect: (id: string) => void; target: View;
  picker: (Coords & { icon: string }) | null;
  onPick: (coords: Coords) => void; gps: Coords | null; search: SearchResult | null;
  onLocate: () => void; onError: (message: string) => void;
};
type Engine = 'streets' | 'satellite' | 'vector';

function pinElement(text: string, selected = false, saved = false, teal = false) {
  const element = document.createElement('div');
  element.className = `map-pin${selected ? ' selected' : ''}${teal ? ' teal' : ''}`;
  element.textContent = text;
  if (saved) {
    const star = document.createElement('span');
    star.className = 'saved-star';
    star.textContent = '★';
    element.append(star);
  }
  return element;
}

export default function CommunityMap(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const viewRef = useRef<View>({ ...CENTER, zoom: 13 });
  const [gridView, setGridView] = useState<View>(viewRef.current);
  const [engine, setEngine] = useState<Engine>('streets');
  const [bright, setBright] = useState(false);
  const { houses, selectedId, savedIds, onSelect, target, picker, onPick, gps, search, onError } = props;

  useEffect(() => {
    if (!container.current) return;
    const map = L.map(container.current, { zoomControl: false, maxZoom: 19, minZoom: 10 })
      .setView([CENTER.lat, CENTER.lng], 13);
    mapRef.current = map;
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    map.on('moveend', () => {
      const { lat, lng } = map.getCenter();
      viewRef.current = { lat, lng, zoom: map.getZoom() };
      setGridView(viewRef.current);
    });
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container.current);
    return () => { observer.disconnect(); map.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || engine === 'vector') return;
    map.invalidateSize();
    map.setView([viewRef.current.lat, viewRef.current.lng], viewRef.current.zoom);
    let failed = 0;
    const error = () => {
      if (++failed === 5) {
        setEngine('vector');
        onError('Map tiles could not load. Showing a schematic grid, not a navigation map.');
      }
    };
    const layer = engine === 'satellite'
      ? L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri, USDA, USGS, GeoEye', maxZoom: 19,
      })
      : L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      });
    layer.on('tileerror', error).addTo(map);
    return () => { layer.off('tileerror', error); layer.remove(); };
  }, [engine, onError]);

  useEffect(() => {
    viewRef.current = target;
    setGridView(target);
    mapRef.current?.setView([target.lat, target.lng], target.zoom);
  }, [target]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layer = L.layerGroup().addTo(map);
    for (const house of houses) {
      const icon = L.divIcon({
        className: 'house-marker',
        html: pinElement(house.status === 'out' ? '🌙' : house.pinIcon,
          house.id === selectedId, savedIds.includes(house.id), house.tags.includes('teal_pumpkin')),
        iconSize: [40, 40], iconAnchor: [20, 20],
      });
      L.marker([house.lat, house.lng], { icon, title: house.address, alt: house.address, keyboard: true })
        .on('click', () => onSelect(house.id)).addTo(layer);
    }
    return () => { layer.remove(); };
  }, [houses, selectedId, savedIds, onSelect]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !picker) return;
    const marker = L.marker([picker.lat, picker.lng], {
      draggable: true, title: 'Drag to adjust your house location',
      icon: L.divIcon({ className: 'house-marker', html: pinElement(picker.icon, true), iconSize: [40, 40], iconAnchor: [20, 20] }),
    }).addTo(map);
    marker.on('dragend', () => onPick(marker.getLatLng()));
    return () => { marker.remove(); };
  }, [picker, onPick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !picker) return;
    const click = (event: L.LeafletMouseEvent) => onPick(event.latlng);
    map.on('click', click);
    return () => { map.off('click', click); };
  }, [picker, onPick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const layer = L.layerGroup().addTo(map);
    if (gps) L.circleMarker([gps.lat, gps.lng], { radius: 8, color: '#ffffff', fillColor: '#38bdf8', fillOpacity: 1 })
      .bindTooltip('Your GPS location').addTo(layer);
    if (search) {
      const label = document.createElement('span');
      label.textContent = search.label;
      L.marker([search.lat, search.lng], {
        icon: L.divIcon({ className: 'house-marker', html: pinElement('🎯', false, false, true), iconSize: [40, 40], iconAnchor: [20, 20] }),
      }).bindTooltip(label).addTo(layer);
    }
    return () => { layer.remove(); };
  }, [gps, search]);

  function changeGrid(view: View) {
    viewRef.current = view;
    setGridView(view);
  }
  return (
    <div className={`community-map ${bright ? 'bright' : 'night'} ${engine}`}>
      <div ref={container} className="leaflet-map" style={{ display: engine === 'vector' ? 'none' : 'block' }} aria-label="Springfield house map" />
      {engine === 'vector' && <GridMap {...props} view={gridView} onView={changeGrid} bright={bright} />}
      <div className="map-controls">
        <div className="row">
          <button onClick={props.onLocate}><Navigation size={15} /> Near Me (GPS)</button>
          {engine !== 'satellite' && <button onClick={() => setBright(v => !v)}>{bright ? <Moon size={15} /> : <Sun size={15} />}{bright ? 'Night' : 'Bright'}</button>}
        </div>
        <div className="segmented">
          {(['streets', 'satellite', 'vector'] as const).map(value => (
            <button key={value} aria-pressed={engine === value} onClick={() => setEngine(value)}>
              {value === 'streets' ? '🗺️ Streets' : value === 'satellite' ? '🛰️ Aerial' : '⚡ Springfield Grid'}
            </button>
          ))}
        </div>
      </div>
      {engine === 'vector' && <p className="grid-notice">Approximate schematic only. Use Streets / Aerial to verify a house pin.</p>}
    </div>
  );
}

function GridMap({ view, onView, bright, ...props }: Props & { view: View; onView: (v: View) => void; bright: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; view: View; moved: boolean } | null>(null);
  const scale = 2 ** (view.zoom - 13) * 9500;
  const project = ({ lat, lng }: Coords) => ({ x: 500 + (lng - view.lng) * scale * 0.72, y: 350 - (lat - view.lat) * scale });
  function point(event: React.PointerEvent<SVGSVGElement>) {
    const matrix = svgRef.current?.getScreenCTM();
    if (!matrix) return null;
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  }
  const streetColor = bright ? '#cbd5e1' : '#263548';
  return <>
    <svg ref={svgRef} className="grid-map" viewBox="0 0 1000 700" aria-label="Approximate Springfield grid"
      onPointerDown={event => {
        if ((event.target as Element).closest('[data-pin]')) return;
        const p = point(event);
        if (!p) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: p.x, y: p.y, view, moved: false };
      }}
      onPointerMove={event => {
        const start = drag.current, p = point(event);
        if (!start || !p) return;
        const dx = p.x - start.x, dy = p.y - start.y;
        if (Math.abs(dx) + Math.abs(dy) > 5) start.moved = true;
        if (start.moved) onView({ ...view,
          lat: Math.min(44.14, Math.max(43.98, start.view.lat + dy / scale)),
          lng: Math.min(-122.80, Math.max(-123.12, start.view.lng - dx / (scale * 0.72))),
        });
      }}
      onPointerUp={event => {
        const p = point(event);
        if (drag.current && !drag.current.moved && p && props.picker) {
          props.onPick({ lat: view.lat - (p.y - 350) / scale, lng: view.lng + (p.x - 500) / (scale * 0.72) });
        }
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { drag.current = null; }}>
      <rect width="1000" height="700" fill={bright ? '#fffbeb' : '#020617'} />
      {Array.from({ length: 23 }, (_, i) => {
        const p = project({ lat: 44.0471 + i * 0.0009, lng: -123.030 });
        const end = project({ lat: 44.0471 + i * 0.0009, lng: -122.910 });
        return <g key={i}><line x1={p.x} x2={end.x} y1={p.y} y2={end.y} stroke={streetColor} />
          {view.zoom >= 14 && <text x="20" y={p.y - 4} fill="#94a3b8" fontSize="10">{String.fromCharCode(65 + i)} St</text>}</g>;
      })}
      {[1, 5, 7, 10, 14, 19, 21, 28, 32, 42, 48, 52, 58, 65, 70].map(number => {
        const p = project({ lat: 44.038, lng: -123.0255 + number * 0.00145 });
        const end = project({ lat: 44.078, lng: -123.0255 + number * 0.00145 });
        return <g key={number}><line x1={p.x} x2={end.x} y1={p.y} y2={end.y} stroke={streetColor} />
          <text x={p.x + 3} y="640" fill="#94a3b8" fontSize="10">{number}{number === 1 || number === 21 ? 'st' : number === 32 || number === 42 || number === 52 ? 'nd' : 'th'} St</text></g>;
      })}
      {NEIGHBORHOODS.slice(1).map(n => {
        const p = project(n);
        return <text key={n.id} x={p.x} y={p.y - 32} fill={bright ? '#c2410c' : '#fdba74'} textAnchor="middle" fontSize="12" fontWeight="bold">{n.id.toUpperCase()}</text>;
      })}
      {props.houses.map(house => {
        const p = project(house);
        return <g data-pin key={house.id} transform={`translate(${p.x},${p.y})`}
          role="button" tabIndex={0} aria-label={`Select ${house.address}`}
          onClick={() => props.onSelect(house.id)}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); props.onSelect(house.id); } }}>
          <circle r={house.id === props.selectedId ? 22 : 18} fill={house.id === props.selectedId ? '#ea580c' : '#0f172a'}
            stroke={house.tags.includes('teal_pumpkin') ? '#2dd4bf' : '#f97316'} strokeWidth="3" />
          <text textAnchor="middle" y="6" fontSize="18">{house.status === 'out' ? '🌙' : house.pinIcon}</text>
          {props.savedIds.includes(house.id) && <text x="12" y="-13" fill="#fb7185">★</text>}
        </g>;
      })}
      {props.picker && (() => {
        const p = project(props.picker);
        return <g transform={`translate(${p.x},${p.y})`}><circle r="23" fill="#f97316" stroke="white" strokeWidth="3" /><text y="7" textAnchor="middle" fontSize="22">{props.picker.icon}</text></g>;
      })()}
      {props.gps && (() => { const p = project(props.gps); return <circle cx={p.x} cy={p.y} r="8" fill="#38bdf8" stroke="white" strokeWidth="3" />; })()}
      {props.search && (() => { const p = project(props.search); return <text x={p.x} y={p.y} textAnchor="middle" fontSize="26">🎯</text>; })()}
    </svg>
    <div className="grid-zoom">
      <button aria-label="Zoom in" onClick={() => onView({ ...view, zoom: Math.min(18, view.zoom + 1) })}>+</button>
      <button aria-label="Zoom out" onClick={() => onView({ ...view, zoom: Math.max(12, view.zoom - 1) })}>−</button>
    </div>
  </>;
}

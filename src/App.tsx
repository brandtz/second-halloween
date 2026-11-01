import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { signOut, type User } from 'firebase/auth';
import { Clock, ExternalLink, Heart, List, Map as MapIcon, MapPin, Plus, Search, Share2, ThumbsUp, X } from 'lucide-react';
import { errorMessage, getServices, watchUser, type Services } from './firebase';
import { changeStatus, removeHouse, saveHouse, toggleSave, toggleVote, watchHouses, watchPreferences, watchVotes } from './data';
import {
  CENTER, DEFAULT_FILTERS, NEIGHBORHOODS, STATUSES, TAGS, directions, filterHouses, insideSpringfield,
  type Coords, type House, type Status,
} from './model';
import { geocodeAddress, type SearchResult } from './geocode';
import CommunityMap, { type View } from './Map';
import AuthDialog from './AuthDialog';
import HouseForm, { newDraft, type Draft } from './HouseForm';

export default function App() {
  const [setup] = useState(() => {
    try { return { services: getServices(), error: '' }; }
    catch (e) { return { services: null, error: errorMessage(e) }; }
  });
  if (!setup.services) return <main className="setup">
    <span className="brand-icon">🎃</span><h1>Second Halloween: Springfield, OR</h1>
    <h2>Setup required</h2><p role="alert">{setup.error}</p>
    <p>No sample houses or local-only data are being presented as live listings.</p>
  </main>;
  return <Community services={setup.services} />;
}

function Community({ services }: { services: Services }) {
  const [user, setUser] = useState<User | null>(null);
  const [houses, setHouses] = useState<House[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectionError, setConnectionError] = useState('');
  const [saved, setSaved] = useState<{ uid: string; ids: string[] } | null>(null);
  const [votes, setVotes] = useState<{ uid: string; ids: string[] } | null>(null);
  const savedIds = useMemo(() => saved?.uid === user?.uid ? saved?.ids ?? [] : [], [saved, user?.uid]);
  const votedIds = votes?.uid === user?.uid ? votes?.ids ?? [] : [];
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = houses.find(h => h.id === selectedId);
  const [mobileView, setMobileView] = useState<'map' | 'list'>('map');
  const [target, setTarget] = useState<View>({ ...CENTER, zoom: 13 });
  const [gps, setGps] = useState<Coords | null>(null);
  const [search, setSearch] = useState<SearchResult | null>(null);
  const [mapQuery, setMapQuery] = useState('');
  const [searchBusy, setSearchBusy] = useState(false);
  const [toast, setToast] = useState<{ message: string; error: boolean } | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [addAfterAuth, setAddAfterAuth] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [online, setOnline] = useState(navigator.onLine);
  const notify = useCallback((message: string) => setToast({ message, error: false }), []);
  const mapError = useCallback((message: string) => setToast({ message, error: true }), []);
  const dateLabel = new Date(`${services.eventId}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC', weekday: 'long', month: 'short', day: 'numeric', year: 'numeric',
  });

  useEffect(() => {
    const fail = (error: unknown) => setConnectionError(errorMessage(error));
    const stopAuth = watchUser(services.auth, setUser, fail);
    const stopHouses = watchHouses(services, next => {
      setHouses(next); setLoading(false);
    }, error => { setLoading(false); fail(error); });
    return () => { stopAuth(); stopHouses(); };
  }, [services]);
  useEffect(() => {
    if (!user) return;
    const fail = (e: unknown) => setConnectionError(errorMessage(e));
    const stopSaved = watchPreferences(services, user.uid, ids => setSaved({ uid: user.uid, ids }), fail);
    const stopVotes = watchVotes(services, user.uid, ids => setVotes({ uid: user.uid, ids }), fail);
    return () => { stopSaved(); stopVotes(); };
  }, [services, user]);
  useEffect(() => {
    if (!toast || toast.error) return;
    const timeout = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);

  const filtered = useMemo(() => filterHouses(houses, filters, savedIds), [houses, filters, savedIds]);
  const active = houses.filter(h => h.status !== 'out').length;
  const teal = houses.filter(h => h.status !== 'out' && h.tags.includes('teal_pumpkin')).length;
  const validSaved = savedIds.filter(id => houses.some(h => h.id === id));
  const select = useCallback((id: string) => {
    const house = houses.find(h => h.id === id);
    if (!house) return;
    setSelectedId(id); setTarget({ lat: house.lat, lng: house.lng, zoom: 16 }); setMobileView('map');
  }, [houses]);
  const pick = useCallback((coords: Coords) => {
    if (!insideSpringfield(coords)) { mapError('Choose a location within the Springfield area.'); return; }
    setDraft(d => d && ({ ...d, confirmed: false, input: { ...d.input, lat: Number(coords.lat.toFixed(6)), lng: Number(coords.lng.toFixed(6)) } }));
  }, [mapError]);

  function add() {
    if (!user || user.isAnonymous) { setAddAfterAuth(true); setAuthOpen(true); return; }
    setDraft(newDraft(filters.neighborhood));
  }
  async function action(work: () => Promise<unknown>, message?: string) {
    if (busyRef.current) return;
    if (!navigator.onLine) { mapError('You are offline. Reconnect before making changes.'); return; }
    busyRef.current = true; setBusy(true);
    try { await work(); if (message) notify(message); }
    catch (e) { mapError(errorMessage(e)); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function jump(event: FormEvent) {
    event.preventDefault(); setSearchBusy(true);
    try {
      const result = await geocodeAddress(mapQuery);
      setSearch(result); setTarget({ ...result, zoom: 16 }); setMobileView('map');
      notify(`Search result: ${result.label}. Verify the pin; address matches may be approximate.`);
    } catch (e) { mapError(errorMessage(e)); }
    finally { setSearchBusy(false); }
  }
  function locate() {
    if (!navigator.geolocation) { mapError('GPS is unavailable in this browser. Use address search instead.'); return; }
    notify('Finding your GPS location…');
    navigator.geolocation.getCurrentPosition(position => {
      const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
      if (!insideSpringfield(coords)) { mapError('Your GPS position is outside the Springfield area. Use address search to plan your walk.'); return; }
      setGps(coords); setTarget({ ...coords, zoom: 16 }); setMobileView('map');
      notify(`GPS location found (accuracy about ${Math.round(position.coords.accuracy)} meters).`);
    }, error => {
      mapError(error.code === 1 ? 'Location permission was denied. Allow location access or use address search.' : 'GPS could not find your location. Use address search instead.');
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 });
  }
  async function share() {
    const text = `Second Halloween in Springfield, OR — ${dateLabel}. ${active} listed candy stops with lights on. Check hours and plan your walk: ${window.location.origin}`;
    try { await navigator.clipboard.writeText(text); notify('Invite copied! Share it with your neighbors.'); }
    catch { mapError('Could not access the clipboard. Copy the page address from your browser to share.'); }
  }
  function edit(house: House) {
    setDraft({ id: house.id, input: {
      address: house.address, neighborhood: house.neighborhood, hours: house.hours, status: house.status,
      tags: [...house.tags], pinIcon: house.pinIcon, note: house.note, lat: house.lat, lng: house.lng,
    }, confirmed: true });
  }
  const owner = (house: House) => !!user && !user.isAnonymous && house.ownerUid === user.uid;
  return <div className="app">
    <header>
      <div className="brand"><span className="brand-icon">🎃</span><div>
        <h1>Second Halloween: Springfield, OR</h1>
        <p><span className="green-text">● {active} Active Candy Stops</span><span className="teal-text">🩵 {teal} Allergy-Friendly</span><span className="event-date">{dateLabel}</span></p>
      </div></div>
      <div className="header-actions">
        <button onClick={share} aria-label="Share with Neighbors"><Share2 size={16} /><span className="desktop-label">Share with Neighbors</span></button>
        {user && !user.isAnonymous
          ? <button disabled={busy} onClick={() => action(() => signOut(services.auth), 'Signed out. Sign in again to manage your house.')}>Sign out</button>
          : <button onClick={() => { setAddAfterAuth(false); setAuthOpen(true); }}>Host sign in</button>}
        <button className="primary" onClick={add}><Plus size={18} />Add Our House</button>
      </div>
    </header>
    {(!online || connectionError) && <div role="alert" className="connection-error">
      {!online ? 'You are offline. Listings may be stale; reconnect before making changes.' : connectionError}
      {connectionError && <button onClick={() => window.location.reload()}>Retry connection</button>}
    </div>}
    <section className="filters" aria-label="Find houses">
      <div className="search-row">
        <form className="map-search" onSubmit={jump}>
          <MapPin size={17} />
          <input aria-label="Jump to Springfield address" placeholder="Jump map to a Springfield address or street…" value={mapQuery} onChange={e => setMapQuery(e.target.value)} maxLength={180} required disabled={searchBusy} />
          {search && <button type="button" aria-label="Clear map search" onClick={() => { setSearch(null); setMapQuery(''); }}><X size={15} /></button>}
          <button className="primary" disabled={searchBusy}>{searchBusy ? 'Locating…' : 'Go to Map'}</button>
        </form>
        <label className="list-search"><Search size={16} /><input aria-label="Filter listed houses or notes" placeholder="Filter listed houses or notes…" value={filters.query} onChange={e => setFilters({ ...filters, query: e.target.value })} /></label>
      </div>
      <div className="filter-pills">
        <select aria-label="Filter by neighborhood" value={filters.neighborhood} onChange={e => {
          setFilters({ ...filters, neighborhood: e.target.value });
          const n = NEIGHBORHOODS.find(n => n.id === e.target.value);
          if (n) setTarget({ lat: n.lat, lng: n.lng, zoom: n.zoom });
        }}>{NEIGHBORHOODS.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select>
        <button className="pill green" aria-pressed={filters.activeOnly} onClick={() => setFilters({ ...filters, activeOnly: !filters.activeOnly })}>● Lights On Only</button>
        <button className="pill rose" aria-pressed={filters.savedOnly} onClick={() => setFilters({ ...filters, savedOnly: !filters.savedOnly })}><Heart size={14} />Our Walk ({validSaved.length})</button>
        {TAGS.map(tag => <button key={tag.id} className={`pill ${tag.color}`} aria-pressed={filters.tag === tag.id}
          onClick={() => setFilters({ ...filters, tag: filters.tag === tag.id ? null : tag.id })}>{tag.emoji} {tag.label}</button>)}
      </div>
    </section>
    <main className={`workspace mobile-${mobileView}`}>
      <section className="map-panel" aria-label="Community map">
        <CommunityMap houses={filtered} selectedId={selectedId} savedIds={savedIds} onSelect={select} target={target}
          picker={picking && draft ? { lat: draft.input.lat, lng: draft.input.lng, icon: draft.input.pinIcon } : null}
          onPick={pick} gps={gps} search={search} onLocate={locate} onError={mapError} />
        {picking && draft && <div className="picker-banner">
          <strong>Tap the map to place your house pin.</strong>
          <span>{draft.input.lat.toFixed(6)}, {draft.input.lng.toFixed(6)}</span>
          <button className="primary" onClick={() => {
            if (!insideSpringfield(draft.input)) { mapError('Choose a valid Springfield location.'); return; }
            setDraft({ ...draft, confirmed: true }); setPicking(false);
          }}>Confirm pin location</button>
          <button onClick={() => setPicking(false)}>Back without confirming</button>
        </div>}
        {selected && !picking && <section className="detail-card" aria-label={`Details for ${selected.address}`}>
          <button className="close-detail" aria-label="Close house details" onClick={() => setSelectedId(null)}><X size={17} /></button>
          <div className="house-heading"><span className="house-emoji">{selected.status === 'out' ? '🌙' : selected.pinIcon}</span><div>
            <HouseBadges house={selected} owned={owner(selected)} /><h2>{selected.address}</h2>
          </div></div>
          <p className="hours"><Clock size={14} /> {dateLabel}: {selected.hours} PT</p>
          {selected.note && <p className="host-note">{selected.note}</p>}
          <HouseTags house={selected} />
          {owner(selected) && <div className="host-controls">
            <div className="row spread"><strong>Your House — Quick Candy Status</strong><button onClick={() => edit(selected)}>Edit Details</button></div>
            <div className="status-options">{(Object.keys(STATUSES) as Status[]).map(status => (
              <button key={status} disabled={busy || !online} aria-pressed={selected.status === status}
                onClick={() => action(() => changeStatus(services, user, selected.id, status), `Status updated: ${STATUSES[status].label}`)}>
                {STATUSES[status].emoji} {status === 'plenty' ? 'Plenty' : status === 'low' ? 'Low' : 'Lights Out'}
              </button>
            ))}</div>
          </div>}
          <div className="detail-actions">
            <button disabled={busy || !user || !online} aria-pressed={votedIds.includes(selected.id)}
              onClick={() => action(() => toggleVote(services, user, selected.id))}><ThumbsUp size={15} />Great Stop ({selected.upvotes})</button>
            <button aria-label={`Save ${selected.address} to Our Walk`} aria-pressed={savedIds.includes(selected.id)} disabled={busy || !user || !online}
              onClick={() => action(() => toggleSave(services, user, selected.id))}><Heart size={17} /></button>
            <a className="button primary" href={directions(selected)} target="_blank" rel="noopener noreferrer">Directions <ExternalLink size={14} /></a>
          </div>
        </section>}
      </section>
      <aside className="directory" aria-label="Participating houses">
        <div className="directory-heading">
          <h2>🏠 Participating Springfield Houses <span className="badge orange">{filtered.length}</span></h2>
          <div className="row spread"><p className="muted small">Choose an address to view its map pin.</p><button className="text-button" onClick={() => { setFilters(DEFAULT_FILTERS); setTarget({ ...CENTER, zoom: 13 }); }}>Reset Filters</button></div>
        </div>
        <div className="house-list">
          {loading ? <p role="status" className="empty">🎃 Loading Springfield houses…</p> : connectionError && !houses.length
            ? <div className="empty"><h3>Listings could not be loaded</h3><p>Resolve the connection error above and retry.</p></div>
            : filtered.length === 0 ? <div className="empty"><span>👻</span><h3>No houses match these filters yet!</h3><p>Clear a filter or be the first neighbor to turn your porch light on.</p><button className="primary" onClick={add}>+ Add Your House Here</button></div>
              : filtered.map(house => <article key={house.id} className={`house-card ${house.id === selectedId ? 'selected' : ''}`}>
                <div className="row spread"><HouseBadges house={house} owned={owner(house)} />
                  <button aria-label={`Bookmark ${house.address}`} aria-pressed={savedIds.includes(house.id)} disabled={busy || !user || !online}
                    onClick={() => action(() => toggleSave(services, user, house.id))}><Heart size={16} /></button></div>
                <button className="house-title" onClick={() => select(house.id)}><span>{house.status === 'out' ? '🌙' : house.pinIcon}</span><h3>{house.address}</h3></button>
                {house.note && <p className="host-note clamp">{house.note}</p>}
                <HouseTags house={house} />
                <div className="card-footer"><span className="hours"><Clock size={13} />{house.hours} PT</span>
                  <button aria-label={`Great stop: ${house.address}`} aria-pressed={votedIds.includes(house.id)} disabled={busy || !user || !online}
                    onClick={() => action(() => toggleVote(services, user, house.id))}><ThumbsUp size={13} />{house.upvotes}</button>
                  <a href={directions(house)} target="_blank" rel="noopener noreferrer">Map <ExternalLink size={12} /></a>
                </div>
              </article>)}
          <p className="safety-note">Community-reported information, not verified participation or allergen safety. Check with each host, respect lights-out homes, and supervise children. Saved walks are a list, not an optimized route.</p>
        </div>
      </aside>
    </main>
    <nav className="mobile-switcher" aria-label="View mode">
      <button aria-pressed={mobileView === 'map'} onClick={() => setMobileView('map')}><MapIcon size={16} />Map View</button>
      <button aria-pressed={mobileView === 'list'} onClick={() => setMobileView('list')}><List size={16} />House List ({filtered.length})</button>
    </nav>
    {authOpen && <AuthDialog services={services} onClose={() => setAuthOpen(false)} onSuccess={() => {
      setAuthOpen(false);
      // Linking an anonymous account may retain the same User object identity.
      setUser(services.auth.currentUser);
      if (addAfterAuth) setDraft(newDraft(filters.neighborhood));
      notify('Host account connected.');
    }} />}
    {draft && !picking && <HouseForm draft={draft} onChange={setDraft} onClose={() => setDraft(null)}
      onPick={() => { setTarget({ lat: draft.input.lat, lng: draft.input.lng, zoom: 17 }); setMobileView('map'); setPicking(true); }}
      onSave={async current => {
        if (!navigator.onLine) throw new Error('You are offline. Reconnect before publishing.');
        const id = await saveHouse(services, services.auth.currentUser, current.input, current.id);
        setSelectedId(id); setTarget({ ...current.input, zoom: 16 }); setDraft(null);
        notify(current.id ? 'House listing updated!' : 'Your house is now live on the Springfield map!');
      }}
      onDelete={async () => {
        if (!navigator.onLine) throw new Error('You are offline. Reconnect before removing your house.');
        if (!draft.id) throw new Error('No house selected for removal.');
        await removeHouse(services, user, draft.id);
        setSelectedId(null); setDraft(null); notify('House removed from the map.');
      }} />}
    {toast && <div className={`toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}>
      <span>{toast.message}</span><button aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={15} /></button>
    </div>}
  </div>;
}

function HouseBadges({ house, owned }: { house: House; owned: boolean }) {
  const status = STATUSES[house.status];
  return <div className="badges"><span className="badge orange">{house.neighborhood}</span>
    <span className={`badge ${status.color}`}>{status.emoji} {status.label}</span>
    {owned && <span className="badge owner">YOUR HOUSE</span>}</div>;
}
function HouseTags({ house }: { house: House }) {
  return <div className="house-tags">{TAGS.filter(tag => house.tags.includes(tag.id)).map(tag =>
    <span key={tag.id} className={`badge ${tag.color}`}>{tag.emoji} {tag.label}</span>)}</div>;
}

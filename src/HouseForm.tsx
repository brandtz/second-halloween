import { useRef, useState, type FormEvent } from 'react';
import { Check, MapPin, Trash2 } from 'lucide-react';
import { ICONS, NEIGHBORHOODS, STATUSES, TAGS, validateHouse, type HouseInput, type Status, type Neighborhood } from './model';
import { geocodeAddress } from './geocode';
import { errorMessage } from './firebase';
import Modal from './Modal';

export type Draft = { input: HouseInput; confirmed: boolean; id?: string };
export function newDraft(neighborhood = 'Washburne'): Draft {
  const n = NEIGHBORHOODS.find(n => n.id === neighborhood && n.id !== 'All') || NEIGHBORHOODS[1];
  return { confirmed: false, input: {
    address: '', neighborhood: n.id as Neighborhood, hours: '5:00 PM - 8:30 PM', status: 'plenty',
    tags: ['full_size'], pinIcon: '🎃', note: '', lat: n.lat, lng: n.lng,
  } };
}
export default function HouseForm({ draft, onChange, onClose, onPick, onSave, onDelete }: {
  draft: Draft; onChange: (d: Draft) => void; onClose: () => void; onPick: () => void;
  onSave: (draft: Draft) => Promise<void>; onDelete: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [locationMessage, setLocationMessage] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const latest = useRef(draft);
  latest.current = draft;
  const { input } = draft;
  const update = (patch: Partial<HouseInput>, unconfirm = false) => onChange({
    ...draft, input: { ...input, ...patch }, confirmed: unconfirm ? false : draft.confirmed,
  });
  async function locate() {
    setLocating(true); setError('');
    const address = input.address;
    try {
      const result = await geocodeAddress(address);
      if (latest.current.input.address !== address) return;
      onChange({ ...latest.current, input: { ...latest.current.input, lat: result.lat, lng: result.lng }, confirmed: false });
      setLocationMessage(`Search result: ${result.label}. View the pin and confirm it marks your home; search results may be approximate.`);
    } catch (e) { setError(errorMessage(e)); }
    finally { setLocating(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const invalid = validateHouse(input);
    if (invalid || !draft.confirmed) { setError(invalid || 'View the map and confirm the pin marks your home before publishing.'); return; }
    setBusy(true); setError('');
    try { await onSave(draft); }
    catch (e) { setError(errorMessage(e)); }
    finally { setBusy(false); }
  }
  return <Modal title={draft.id ? 'Update Your House Status' : 'Add Your House to Second Halloween'} onClose={onClose} busy={busy || locating}>
    <p className="muted small">Your address, pin, hours, and note will be public. Only list your own home, with your household's permission.</p>
    <form onSubmit={submit}>
      <fieldset disabled={busy || locating}>
        <label>Springfield Area<select value={input.neighborhood} onChange={e => update({ neighborhood: e.target.value as Neighborhood })}>
          {NEIGHBORHOODS.slice(1).map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select></label>
        <label>Street Address or Cross-Streets<input required maxLength={180} value={input.address}
          placeholder="e.g. 642 C St" onChange={e => update({ address: e.target.value }, true)} /></label>
        <div className="row wrap">
          <button type="button" onClick={locate}><MapPin size={15} />{locating ? 'Locating…' : 'Locate on Map'}</button>
          <button type="button" onClick={onPick}>View / Adjust Pin on Map</button>
        </div>
        <div className="location-box">
          <strong>{draft.confirmed ? '✓ Pin confirmed' : 'Pin needs confirmation'}</strong>
          <p>{locationMessage || 'Locate your address, then view the map to check the pin. No random or guessed location will be published.'}</p>
          <div className="two-columns">
            <label>Latitude<input required type="number" step="any" min="43.98" max="44.14" value={input.lat}
              onChange={e => update({ lat: e.target.valueAsNumber }, true)} /></label>
            <label>Longitude<input required type="number" step="any" min="-123.12" max="-122.80" value={input.lng}
              onChange={e => update({ lng: e.target.valueAsNumber }, true)} /></label>
          </div>
        </div>
        <label>Active Hours (Pacific Time)<input required maxLength={80} value={input.hours} onChange={e => update({ hours: e.target.value })} /></label>
        <fieldset><legend>Choose Map Icon</legend><div className="icon-options">
          {ICONS.map(icon => <button key={icon} type="button" aria-label={`Use ${icon} pin`} aria-pressed={input.pinIcon === icon} onClick={() => update({ pinIcon: icon })}>{icon}</button>)}
        </div></fieldset>
        <fieldset><legend>Candy & Porch Light Status</legend><div className="status-options">
          {(Object.keys(STATUSES) as Status[]).map(status => <button key={status} type="button" aria-pressed={input.status === status}
            onClick={() => update({ status })}>{STATUSES[status].emoji} {STATUSES[status].label}</button>)}
        </div></fieldset>
        <fieldset><legend>Special Features & Treats</legend><div className="row wrap">
          {TAGS.map(tag => <button key={tag.id} type="button" className={`pill ${tag.color}`}
            aria-pressed={input.tags.includes(tag.id)} onClick={() => update({ tags: input.tags.includes(tag.id) ? input.tags.filter(t => t !== tag.id) : [...input.tags, tag.id] })}>
            {tag.emoji} {tag.label} {input.tags.includes(tag.id) && <Check size={12} />}
          </button>)}
        </div></fieldset>
        <label>Note for Parents & Kids<textarea rows={3} maxLength={1000} value={input.note}
          placeholder="Treat details, porch access, or a friendly hello…" onChange={e => update({ note: e.target.value })} /></label>
      </fieldset>
      {error && <p role="alert" className="error">{error}</p>}
      {deleteConfirm && <div className="error">
        <p>Remove your house from the public map? This cannot be undone.</p>
        <button type="button" disabled={busy} className="danger" onClick={async () => {
          setBusy(true); setError('');
          try { await onDelete(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
        }}>Confirm removal</button>
        <button type="button" disabled={busy} onClick={() => setDeleteConfirm(false)}>Keep house</button>
      </div>}
      <div className="modal-footer">
        {draft.id && <button type="button" className="danger" disabled={busy || locating} onClick={() => setDeleteConfirm(true)}><Trash2 size={15} />Remove Stop</button>}
        <button type="button" disabled={busy || locating} onClick={onClose}>Cancel</button>
        <button className="primary" disabled={busy || locating}>{busy ? 'Saving…' : draft.id ? 'Save Changes' : '🎃 Post Our House Live'}</button>
      </div>
    </form>
  </Modal>;
}

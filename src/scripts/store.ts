/**
 * Warenkorb-Zustand. Liegt nur im Browser (localStorage) – reine Komfort-
 * funktion; die verbindliche Preisberechnung macht der Server.
 */
import { computeTotals, findZone, lineKey, priceLine, PricingError, type LineInput, type PricedLine, type Totals } from '../lib/pricing.ts';
import { data, product } from './data.ts';

export type Mode = 'delivery' | 'pickup';
interface State {
  lines: LineInput[];
  mode: Mode;
  zip: string;
}
export interface Snapshot {
  lines: PricedLine[];
  totals: Totals;
  mode: Mode;
  zip: string;
}
type Listener = (snap: Snapshot, change: Change) => void;
export type Change = { type: 'init' | 'add' | 'qty' | 'remove' | 'mode' | 'zip' | 'clear' | 'sync'; key?: string };

const KEY = 'pizzarella.cart.v1';
const listeners = new Set<Listener>();
let state: State = load();
let snapshot: Snapshot = derive();

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function load(): State {
  const fallback: State = { lines: [], mode: data().ordering?.defaultMode ?? 'delivery', zip: '' };
  try {
    const raw = storage()?.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<State>;
    const lines = Array.isArray(parsed.lines) ? parsed.lines : [];
    return {
      // Positionen verwerfen, die es nach einer Kartenänderung nicht mehr gibt
      lines: lines.filter((l) => {
        try {
          priceLine(product, l);
          return true;
        } catch {
          return false;
        }
      }),
      mode: parsed.mode === 'pickup' || parsed.mode === 'delivery' ? parsed.mode : fallback.mode,
      zip: typeof parsed.zip === 'string' ? parsed.zip.slice(0, 5) : '',
    };
  } catch {
    return fallback;
  }
}

function persist() {
  try {
    storage()?.setItem(KEY, JSON.stringify(state));
  } catch {
    /* privater Modus o. ä. – Warenkorb funktioniert trotzdem für diese Seite */
  }
}

function derive(): Snapshot {
  const lines: PricedLine[] = [];
  for (const l of state.lines) {
    try {
      lines.push(priceLine(product, l));
    } catch {
      /* ignoriert */
    }
  }
  const zone = state.mode === 'delivery' ? findZone(data().ordering?.zones ?? [], state.zip) : null;
  return { lines, totals: computeTotals(lines, state.mode, zone, data().ordering?.minOrderExclude ?? []), mode: state.mode, zip: state.zip };
}

function commit(change: Change, save = true) {
  snapshot = derive();
  if (save) persist();
  for (const fn of listeners) fn(snapshot, change);
}

export const cart = {
  get(): Snapshot {
    return snapshot;
  },
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    fn(snapshot, { type: 'init' });
    return () => listeners.delete(fn);
  },
  /** fügt hinzu oder erhöht die Menge; wirft bei ungültiger Auswahl */
  add(input: LineInput): string {
    const priced = priceLine(product, input);
    const existing = state.lines.find((l) => lineKey(l) === priced.key);
    if (existing) existing.qty = Math.min(50, existing.qty + input.qty);
    else state.lines.push({ productId: input.productId, variantId: input.variantId, options: priced.options, qty: input.qty, note: priced.note });
    commit({ type: 'add', key: priced.key });
    return priced.key;
  },
  setQty(key: string, qty: number) {
    const line = state.lines.find((l) => lineKey(l) === key);
    if (!line) return;
    if (qty <= 0) {
      cart.remove(key);
      return;
    }
    line.qty = Math.min(50, Math.max(1, Math.round(qty)));
    commit({ type: 'qty', key });
  },
  remove(key: string): LineInput | null {
    const idx = state.lines.findIndex((l) => lineKey(l) === key);
    if (idx < 0) return null;
    const [removed] = state.lines.splice(idx, 1);
    commit({ type: 'remove', key });
    return removed;
  },
  restore(line: LineInput, index?: number) {
    if (index !== undefined) state.lines.splice(index, 0, line);
    else state.lines.push(line);
    commit({ type: 'add', key: lineKey(line) });
  },
  indexOf(key: string): number {
    return state.lines.findIndex((l) => lineKey(l) === key);
  },
  setMode(mode: Mode) {
    if (state.mode === mode) return;
    state.mode = mode;
    commit({ type: 'mode' });
  },
  setZip(zip: string) {
    state.zip = zip.replace(/\D/g, '').slice(0, 5);
    commit({ type: 'zip' });
  },
  clear() {
    state.lines = [];
    commit({ type: 'clear' });
  },
  raw(): State {
    return JSON.parse(JSON.stringify(state)) as State;
  },
};

export { PricingError };

// Mehrere Tabs synchron halten
window.addEventListener('storage', (e) => {
  if (e.key !== KEY) return;
  state = load();
  commit({ type: 'sync' }, false);
});

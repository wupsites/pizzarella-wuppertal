/**
 * Bilder der Speisekarte aus Ebenen (Exploded View beim Überfahren):
 * Pizzen setzen sich aus Teig, Sauce, Käse und Belag zusammen (Belag aus den
 * Extra-Zutaten, siehe pizza-builder.ts); alle anderen Gerichte und Getränke
 * aus fertig gerenderten Ebenen (src/data/dish-art.json, erzeugt mit
 * scripts/dish-art/build.py). Beschriftet wird nur, was auf der Karte steht.
 */
import art from '../data/dish-art.json';

export interface VizLayer {
  /** Bild der Ebene (sonst eine CSS-Klasse, z. B. für die Pizza-Ebenen) */
  src?: string;
  cls?: string;
  /** Beschriftung; leer = Unterlage/Gefäß ohne Beschriftung */
  label: string;
}

export interface Viz {
  /** von unten nach oben */
  layers: VizLayer[];
  /** nur Pizza: Belag (Extra-Zutaten), wird im Browser verteilt */
  tops?: string[];
}

const table = art as unknown as Record<string, [string, string][] | string>;

export function artFor(productId: string): Viz | null {
  const entry = table[productId];
  if (!Array.isArray(entry) || entry.length < 2) return null;
  return { layers: entry.map(([file, label]) => ({ src: file.startsWith('/') ? file : `/dishes/${file}.webp`, label })) };
}

/** alle Gerichte mit Bild (für Tests) */
export function artIds(): string[] {
  return Object.keys(table).filter((k) => !k.startsWith('$'));
}

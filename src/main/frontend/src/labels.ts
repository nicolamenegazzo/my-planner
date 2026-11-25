import type { SprintStatus } from './types';

export const SPRINT_STATUS: Record<SprintStatus, { label: string; color: string }> = {
  PLANNED: { label: 'Pianificato', color: '#579bfc' },
  ACTIVE: { label: 'Attivo', color: '#00c875' },
  CLOSED: { label: 'Chiuso', color: '#a0a0a0' },
};

export const PROJECT_COLORS = [
  '#579bfc', '#00c875', '#fdab3d', '#e2445c', '#a25ddc', '#037f4c',
  '#ff158a', '#bb3354', '#ff642e', '#66ccff', '#784bd1', '#cab641',
  '#c4c4c4', '#333333', '#401694', '#7f5347',
];

export const NEUTRAL_COLOR = '#c4c4c4';

export function formatDate(iso?: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** Data locale in formato ISO (yyyy-mm-dd), senza conversioni di fuso. */
export function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Data/ora locale nel formato atteso da LocalDateTime lato server. */
export function isoDateTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Testo scuro o chiaro a seconda della luminosità dello sfondo (le etichette monday includono colori chiari). */
export function textColorOn(hex?: string | null): string {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return '#fff';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.299 * r + 0.587 * g + 0.114 * b > 170 ? '#323338' : '#fff';
}

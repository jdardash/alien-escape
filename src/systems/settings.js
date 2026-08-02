/**
 * The cabinet's knobs that are not DIP switches.
 *
 * Two of the operator's controls live on the boardset rather than in the
 * switch blocks: the volume pot on the PCB edge, and the monitor's own
 * controls behind the bezel. `dips.js` deliberately holds only what the DIP
 * sheet holds, so these live in their own block: the master volume as the
 * pot, and a scanline overlay standing in for the shadow-mask monitor the
 * game was drawn for. Both are edited from the service screen and stored
 * like machine settings -- they survive a reload and apply to whoever plays
 * next.
 */

export const SETTINGS_KEY = 'alienEscape.settings';

/** The pot is edited in detents of a tenth of full volume. */
export const VOLUME_STEP = 0.1;

export const SETTINGS_DEFAULTS = Object.freeze({
  /** Full volume out of the factory, like the pot turned all the way up. */
  masterVolume: 1,
  /** The overlay is opt-in: a flat panel without it is closer than a bad CRT. */
  scanlines: false,
});

/** Snap a volume onto the knob's detents, clamped into 0..1. */
function snapVolume(value) {
  const clamped = Math.min(Math.max(value, 0), 1);
  return Math.round(clamped / VOLUME_STEP) * VOLUME_STEP;
}

/** Turn the pot one detent; it stops at the ends rather than wrapping. */
export function stepVolume(current, direction) {
  return snapVolume(current + direction * VOLUME_STEP);
}

/** Force a stored block into a valid one, field by field. */
export function normalizeSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    masterVolume: Number.isFinite(source.masterVolume)
      ? snapVolume(source.masterVolume)
      : SETTINGS_DEFAULTS.masterVolume,
    scanlines:
      typeof source.scanlines === 'boolean'
        ? source.scanlines
        : SETTINGS_DEFAULTS.scanlines,
  };
}

/** Read the block. Anything unreadable is the factory block. */
export function loadSettings(storage, key = SETTINGS_KEY) {
  try {
    const raw = storage.getItem(key);
    if (raw === null || raw === undefined) return { ...SETTINGS_DEFAULTS };
    return normalizeSettings(JSON.parse(raw));
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

/** Write the block, returning what is now in force. */
export function saveSettings(storage, settings, key = SETTINGS_KEY) {
  const normalized = normalizeSettings(settings);
  try {
    storage.setItem(key, JSON.stringify(normalized));
  } catch {
    // A full or read-only quota should not stop the machine.
  }
  return normalized;
}

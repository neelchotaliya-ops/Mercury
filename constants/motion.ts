import { Easing } from 'react-native-reanimated';

/**
 * One source of truth for motion.
 *
 * The guiding rule: motion must be *caused*. Something the user did, or a
 * number that actually changed, earns an animation. Nothing animates just
 * because a screen exists — ambient, always-running loops were the single
 * largest source of dropped frames in this app, and they also make the UI feel
 * busy rather than crafted.
 *
 * Prefer transform and opacity. Both are handled on the UI thread by
 * Reanimated and never re-layout or re-rasterise. Animating layout props
 * (width/height/margins) or SVG path data forces work on every frame and is
 * what makes mid-range Android devices stutter.
 */

/** Durations in ms. Short by design — perceptible, never a wait. */
export const Duration = {
  /** Press states, toggles. Should read as instant. */
  instant: 110,
  /** The default for most UI transitions. */
  quick: 190,
  /** Entrances, expanding surfaces. */
  base: 260,
  /** Value changes worth noticing, e.g. a progress bar filling. */
  emphasis: 420,
} as const;

/**
 * Standard easing. `out` decelerates into place and is the right default for
 * anything entering or responding to touch; `inOut` suits movement between two
 * on-screen states.
 */
export const Ease = {
  out: Easing.out(Easing.cubic),
  inOut: Easing.inOut(Easing.quad),
  /** Slight overshoot for playful, high-value confirmations only. */
  emphasis: Easing.bezier(0.2, 0.9, 0.25, 1.1),
} as const;

/**
 * Spring configs. Reanimated springs are frame-rate independent and cheap, so
 * these are preferred over timing for anything touch-driven.
 */
export const Spring = {
  /** Buttons, tiles, tab icons. Settles fast with no visible wobble. */
  press: { damping: 22, stiffness: 340, mass: 0.6 },
  /** Panels and cards settling into place. */
  settle: { damping: 20, stiffness: 210, mass: 0.8 },
  /** A number or badge that changed and should draw the eye once. */
  pop: { damping: 14, stiffness: 260, mass: 0.7 },
} as const;

/** Scale targets for press feedback, kept subtle and consistent app-wide. */
export const PressScale = {
  /** Large surfaces: cards, list rows. */
  card: 0.985,
  /** Buttons and pills. */
  button: 0.97,
  /** Small circular controls and keypad keys. */
  control: 0.93,
} as const;

/**
 * Stagger for list entrances.
 *
 * Capped deliberately: an uncapped `index * delay` turns a long list into a
 * multi-second cascade the user has to sit through, and schedules an animation
 * per row. Only the first few rows stagger; everything after appears with the
 * last one.
 */
export const STAGGER_STEP = 45;
export const STAGGER_MAX_ITEMS = 6;

export function staggerDelay(index: number): number {
  return Math.min(index, STAGGER_MAX_ITEMS) * STAGGER_STEP;
}

import type { TrackerResetFrequency } from '@/services/trackers'

/**
 * Vantura's fully computed categorical colour system. Nothing here is
 * user-chosen or stored — every colour is derived at render time from the
 * entity's own stable id (or, for categories, its Up Bank taxonomy
 * position). Every hex value below was validated with the dataviz skill's
 * validate_palette.js (OKLCH bands, simulated colour-vision-deficiency
 * separation, WCAG contrast) against Vantura's real surface tokens
 * (#ffffff light / #1c1c28 dark) — see project memory
 * feature_palette_redesign_2026_08_08 for the full design record.
 */

export type ColorMode = 'light' | 'dark'

/** Deterministic djb2-style string hash. Not cryptographic — just needs to
 * decorrelate an entity's id from its creation order so colour assignment
 * doesn't visibly cycle in sequence. */
function hashString(input: string): number {
  let hash = 5381
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i)
  }
  return hash >>> 0
}

// ── Uncategorised — fixed neutral, outside the hue system ──────────────────

const UNCATEGORISED_HEX: Record<ColorMode, string> = {
  light: '#6b6b76',
  dark: '#9a9aa5',
}

// ── Category family hues (6 families: Home, Transport, Good Life x2, Personal x2) ──
// Ordinal shade ramps, index 0 = darkest/first child position. Same hue
// angle in both modes, only lightness/chroma retuned per surface.

type CategoryFamily =
  | 'home'
  | 'transport'
  | 'goodLifeA'
  | 'goodLifeB'
  | 'personalA'
  | 'personalB'

const CATEGORY_RAMPS: Record<CategoryFamily, Record<ColorMode, string[]>> = {
  home: {
    light: [
      '#003402',
      '#004613',
      '#005925',
      '#006c37',
      '#008049',
      '#13945c',
      '#34a96f',
      '#4dbe82',
    ],
    dark: [
      '#006730',
      '#007b43',
      '#139056',
      '#35a66a',
      '#4ebb7e',
      '#66d293',
      '#7de9a9',
      '#94ffbf',
    ],
  },
  transport: {
    light: [
      '#481e00',
      '#5b3000',
      '#6e4114',
      '#825428',
      '#96663c',
      '#ab7a4f',
      '#c08e62',
      '#d5a276',
    ],
    dark: [
      '#6a4729',
      '#7e593b',
      '#926c4e',
      '#a67f60',
      '#bb9374',
      '#d0a788',
      '#e6bc9c',
      '#fcd1b0',
    ],
  },
  goodLifeA: {
    light: ['#4a0953', '#62256b', '#7b3d84', '#95559e', '#b06eb9', '#cb88d4'],
    dark: ['#793b82', '#91529a', '#ab69b4', '#c482ce', '#df9ae8', '#fab4ff'],
  },
  goodLifeB: {
    light: ['#5e0019', '#79192e', '#953444', '#b14d5b', '#cd6773', '#ea808c'],
    dark: ['#86323e', '#9f4853', '#b85f68', '#d1757f', '#eb8d96', '#ffa5ad'],
  },
  personalA: {
    light: ['#00364e', '#004d66', '#00657e', '#257d98', '#4397b2', '#5fb1cd'],
    dark: ['#00627d', '#227a95', '#3f92ae', '#59abc8', '#73c4e2', '#8ddefd'],
  },
  personalB: {
    light: ['#271d6c', '#3a3686', '#4f4ea0', '#6667bc', '#7d80d8', '#969af4'],
    dark: ['#4d4c9e', '#6263b8', '#797bd2', '#9094ed', '#a8adff', '#c1c7ff'],
  },
}

/**
 * Maps every real Up Bank category id (confirmed 2026-08-09 via
 * `GET /api/v1/categories` against a live account — 4 parents, 40 children,
 * matches the previously-curated display-name taxonomy exactly) to its
 * family + ordinal shade index.
 *
 * Good Life and Personal are each split 6/6 into their two sub-hue families
 * by theme, not alphabetically: Good Life A = "going out" (events, hobbies,
 * holidays, pubs, restaurants, takeaway), Good Life B = "home/vices" (apps,
 * booze, gambling, tobacco, TV/music, adult); Personal A = "self & body"
 * (clothing, fitness, hair/beauty, health, news/books, technology),
 * Personal B = "admin & obligations" (family, education, gifts/charity,
 * investments, life admin, mobile phone). Within each sub-group, shade
 * index is assigned alphabetically by id — no meaning beyond determinism.
 */
const CATEGORY_ID_TO_SLOT: Record<
  string,
  { family: CategoryFamily; index: number }
> = {
  // home
  groceries: { family: 'home', index: 0 },
  'home-insurance-and-rates': { family: 'home', index: 1 },
  'home-maintenance-and-improvements': { family: 'home', index: 2 },
  'homeware-and-appliances': { family: 'home', index: 3 },
  internet: { family: 'home', index: 4 },
  pets: { family: 'home', index: 5 },
  'rent-and-mortgage': { family: 'home', index: 6 },
  utilities: { family: 'home', index: 7 },
  // transport
  'car-insurance-and-maintenance': { family: 'transport', index: 0 },
  'car-repayments': { family: 'transport', index: 1 },
  cycling: { family: 'transport', index: 2 },
  fuel: { family: 'transport', index: 3 },
  parking: { family: 'transport', index: 4 },
  'public-transport': { family: 'transport', index: 5 },
  'taxis-and-share-cars': { family: 'transport', index: 6 },
  'toll-roads': { family: 'transport', index: 7 },
  // good life — "going out"
  'events-and-gigs': { family: 'goodLifeA', index: 0 },
  hobbies: { family: 'goodLifeA', index: 1 },
  'holidays-and-travel': { family: 'goodLifeA', index: 2 },
  'pubs-and-bars': { family: 'goodLifeA', index: 3 },
  'restaurants-and-cafes': { family: 'goodLifeA', index: 4 },
  takeaway: { family: 'goodLifeA', index: 5 },
  // good life — "home / vices"
  adult: { family: 'goodLifeB', index: 0 },
  booze: { family: 'goodLifeB', index: 1 },
  'games-and-software': { family: 'goodLifeB', index: 2 },
  'lottery-and-gambling': { family: 'goodLifeB', index: 3 },
  'tobacco-and-vaping': { family: 'goodLifeB', index: 4 },
  'tv-and-music': { family: 'goodLifeB', index: 5 },
  // personal — "self & body"
  'clothing-and-accessories': { family: 'personalA', index: 0 },
  'fitness-and-wellbeing': { family: 'personalA', index: 1 },
  'hair-and-beauty': { family: 'personalA', index: 2 },
  'health-and-medical': { family: 'personalA', index: 3 },
  'news-magazines-and-books': { family: 'personalA', index: 4 },
  technology: { family: 'personalA', index: 5 },
  // personal — "admin & obligations"
  'education-and-student-loans': { family: 'personalB', index: 0 },
  family: { family: 'personalB', index: 1 },
  'gifts-and-charity': { family: 'personalB', index: 2 },
  investments: { family: 'personalB', index: 3 },
  'life-admin': { family: 'personalB', index: 4 },
  'mobile-phone': { family: 'personalB', index: 5 },
}

export function getCategoryColor(
  categoryId: string | null | undefined,
  mode: ColorMode
): string {
  if (!categoryId) return UNCATEGORISED_HEX[mode]
  const slot = CATEGORY_ID_TO_SLOT[categoryId]
  if (!slot) return UNCATEGORISED_HEX[mode]
  const ramp = CATEGORY_RAMPS[slot.family][mode]
  return ramp[slot.index % ramp.length]
}

export function getUncategorisedColor(mode: ColorMode): string {
  return UNCATEGORISED_HEX[mode]
}

// ── Bucket / tracker hues — separate pool from categories and from Sky ─────

type BucketFamily = 'teal' | 'red' | 'rose'
const BUCKET_FAMILIES: BucketFamily[] = ['teal', 'red', 'rose']

const BUCKET_RAMPS: Record<BucketFamily, Record<ColorMode, string[]>> = {
  teal: {
    light: ['#00441e', '#005b34', '#00744a', '#158d62', '#3ba77a', '#59c294'],
    dark: ['#006c44', '#00845a', '#2a9c71', '#49b689', '#65cfa1', '#80eabb'],
  },
  red: {
    light: ['#5c010a', '#772020', '#923a36', '#ad524e', '#c96c65', '#e6857e'],
    dark: ['#833737', '#9b4d4c', '#b46361', '#cd7a77', '#e7918e', '#ffa9a5'],
  },
  rose: {
    light: ['#431256', '#5b2b6e', '#734288', '#8c5aa2', '#a673bd', '#c18dd8'],
    dark: ['#714085', '#89579e', '#a16fb8', '#ba87d2', '#d4a0ec', '#efb9ff'],
  },
}

/** Family + shade for a given stable id string, via two independent hashes
 * so colliding on the same family doesn't also collide on the same shade. */
function resolveBucketSlot(idKey: string): {
  family: BucketFamily
  index: number
} {
  const familyHash = hashString(idKey)
  const shadeHash = hashString(`${idKey}:shade`)
  const family = BUCKET_FAMILIES[familyHash % BUCKET_FAMILIES.length]
  const shadeCount = BUCKET_RAMPS[family].light.length
  return { family, index: shadeHash % shadeCount }
}

export function getBucketColor(bucketId: number, mode: ColorMode): string {
  const { family, index } = resolveBucketSlot(`bucket:${bucketId}`)
  return BUCKET_RAMPS[family][mode][index]
}

/**
 * A tracker assigned to a bucket inherits that bucket's hue family at its
 * own shade (so it reads as "part of this bucket" while still being
 * distinguishable from its siblings). An unassigned tracker draws from the
 * same bucket/tracker hue pool via its own id.
 */
export function getTrackerColor(
  tracker: { id: number; bucket_id: number | null },
  mode: ColorMode
): string {
  if (tracker.bucket_id != null) {
    const { family } = resolveBucketSlot(`bucket:${tracker.bucket_id}`)
    const shadeHash = hashString(`tracker:${tracker.id}`)
    const shadeCount = BUCKET_RAMPS[family].light.length
    return BUCKET_RAMPS[family][mode][shadeHash % shadeCount]
  }
  const { family, index } = resolveBucketSlot(`tracker:${tracker.id}`)
  return BUCKET_RAMPS[family][mode][index]
}

// ── Frequency badges — small fixed 4-tint system, separate from identity ───
// Deliberately low-chroma (~0.05) so it never reads as an identity colour;
// same tint for a given frequency on every tracker (frequency is a shared
// attribute, not identity — see project memory for the reasoning).

const FREQUENCY_BADGE_HEX: Record<
  TrackerResetFrequency,
  Record<ColorMode, { bg: string; text: string }>
> = {
  WEEKLY: {
    light: { bg: '#badef0', text: '#005574' },
    dark: { bg: '#0d3242', text: '#80c1e1' },
  },
  FORTNIGHTLY: {
    light: { bg: '#bfe1cd', text: '#0c5c3c' },
    dark: { bg: '#143525', text: '#8ac8a6' },
  },
  MONTHLY: {
    light: { bg: '#ded1f0', text: '#593f74' },
    dark: { bg: '#342742', text: '#c3abe1' },
  },
  PAYDAY: {
    light: { bg: '#f2cfc0', text: '#743b1f' },
    dark: { bg: '#422518', text: '#e3a88d' },
  },
}

export function getFrequencyBadgeColors(
  frequency: TrackerResetFrequency,
  mode: ColorMode
): { bg: string; text: string } {
  return FREQUENCY_BADGE_HEX[frequency][mode]
}

'use strict';

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
// Shared constants used across the front-end. Loaded before app.js.

const SHIFT_HRS = 8;
const DEFAULT_PROD_PCT = 70;
const WEEKS_PER_MONTH = 4.33;
const WEEKS_PER_QTR = WEEKS_PER_MONTH * 3;
const WEEKS_PER_YEAR = WEEKS_PER_QTR * 4;

const VIEW_SCALE = { weekly: 1, monthly: WEEKS_PER_MONTH, quarterly: WEEKS_PER_QTR, yearly: WEEKS_PER_YEAR };
const VIEW_LABEL = { weekly: 'Wk', monthly: 'Mo', quarterly: 'Qtr', yearly: 'FY' };

// Labs that run on IndySoft (everything else = CalTrak)
const INDYSOFT_LABS = new Set([
  'Tangent Decatur Cal Lab', 'Tangent Indianapolis Lab', 'Montreal Cal Lab',
  'Biomedical', 'Chesapeake Cal Lab', 'Cleveland Cal Lab', 'San Diego Cal Lab',
  'Pipettes Milford Lab', 'Pipettes Field Service', 'Pipettes San Diego Lab'
]);

// Maps schedule export lab codes → canonical BASE_LABS lab keys
// Handles both legacy DB entries ("05 houston") and newly uploaded ones
const SCHEDULE_LAB_KEY_MAP = {
  '01 rochester':    'rochester cal lab',
  '02 portland':     'portland cal lab',
  '05 houston':      'houston cal lab',
  '06 philadelphia': 'philadelphia cal lab',
  '09 toronto':      'toronto cal lab',
  '11 boston':       'boston cal lab',
  '15 dayton':       'dayton cal lab',
  '17 charlotte':    'charlotte cal lab',
  '19 los angeles':  'los angeles cal lab',
  '23 denver':       'denver cal lab',
  '24 phoenix':      'phoenix cal lab',
  '31 san diego':    'san diego cal lab',
  '33 ottawa':       'ottawa cal lab',
  '61 palm beach':   'palm beach cal lab',
  'm5 st louis':     'st louis cal lab',
};

const EMPTY_LAB_MAPPING = Object.freeze({
  aliasToCanonicalKey: {},
  canonicalLabByKey: {},
  systemByCanonicalKey: {},
  isActiveByCanonicalKey: {},
  activeLabKeySet: new Set(),
});

// Base lab list — only labs we actively track
// CalTrak labs with std hours data + IndySoft labs (tracked separately)
// Martin labs and other unmeasured non-IndySoft labs are excluded
const BASE_LABS = [
  // ── CalTrak labs (have std hours / demand data) ──────────────────────────
  {lab:'Houston Cal Lab',             techs:34, stdHrs:943},
  {lab:'Philadelphia Cal Lab',        techs:30, stdHrs:618},
  {lab:'Rochester Cal Lab',           techs:27, stdHrs:1084},
  {lab:'Dayton Cal Lab',              techs:19, stdHrs:882},
  {lab:'Toronto Cal Lab',             techs:19, stdHrs:321},
  {lab:'Charlotte Cal Lab',           techs:17, stdHrs:369},
  {lab:'Denver Cal Lab',              techs:15, stdHrs:552},
  {lab:'Pittsburgh Cal Lab',          techs:14, stdHrs:515},
  {lab:'Los Angeles Cal Lab',         techs:13, stdHrs:539},
  {lab:'St. Louis Cal Lab',           techs:12, stdHrs:487},
  {lab:'Boston Cal Lab',              techs:9,  stdHrs:274},
  {lab:'Portland Cal Lab',            techs:7,  stdHrs:354},
  {lab:'Honda Lincoln, AL (AAP)',     techs:7,  stdHrs:166},
  {lab:'Phoenix Cal Lab',             techs:7,  stdHrs:null},
  {lab:'Palm Beach Cal Lab',          techs:4,  stdHrs:140},
  {lab:'Honda E Liberty, OH (ELP)',   techs:3,  stdHrs:54},
  {lab:'Honda Greensburg IN (IAP)',   techs:3,  stdHrs:57},
  {lab:'Ottawa Cal Lab',              techs:3,  stdHrs:77},
  {lab:'Honda Dayton, OH',            techs:2,  stdHrs:82},
  {lab:'Puerto Rico Cal Lab',         techs:2,  stdHrs:29},
  {lab:'Honda Anna, OH (AEP)',        techs:1,  stdHrs:23},
  {lab:'Honda Marysville OH (MAP)',   techs:1,  stdHrs:44},
  // ── IndySoft labs (shown when IndySoft filter is active) ─────────────────
  {lab:'Biomedical',                  techs:33, stdHrs:null},
  {lab:'Montreal Cal Lab',            techs:24, stdHrs:null},
  {lab:'Pipettes Milford Lab',        techs:21, stdHrs:null},
  {lab:'Chesapeake Cal Lab',          techs:12, stdHrs:null},
  {lab:'Cleveland Cal Lab',           techs:12, stdHrs:null},
  {lab:'Pipettes Field Service',      techs:11, stdHrs:null},
  {lab:'San Diego Cal Lab',           techs:6,  stdHrs:null},
  {lab:'Tangent Indianapolis Lab',    techs:5,  stdHrs:null},
  {lab:'Tangent Decatur Cal Lab',     techs:3,  stdHrs:null},
  {lab:'Pipettes San Diego Lab',      techs:3,  stdHrs:null},
];

// Calendar-month labels for modal charts
const CAL_MONTH_SUFFIXES = ['01','02','03','04','05','06','07','08','09','10','11','12'];
const CAL_MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

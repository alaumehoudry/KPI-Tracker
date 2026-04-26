export interface HubConfig {
  label: string;
  masterSheetId: string;
  /**
   * When set, getAllRows reads from each rep's individual sheet using this tab
   * name instead of reading from the master sheet.  Set this for hubs that
   * have no master-sheet aggregation layer (e.g. Hub RA).
   */
  individualReadTab?: string;
  repMap: Record<string, string>;        // repName → repId (col B of master sheet)
  repSheetIds: Record<string, string>;   // repName → individual sheet ID
  bookingNameMap: Record<string, string>; // lowercase full name → repName
}

export const HUB_CONFIG: Record<string, HubConfig> = {
  sud: {
    label: 'Hub Sud',
    masterSheetId: '1DaKTSxuhMpTjPT3y5gL02Rd9Wr2vvOA0V-MxKEJaxxI',
    repMap: {
      LORIS:    'REP_01',
      INTISSAR: 'REP_03',
      ZINEDINE: 'REP_04',
      ÉDOUARD:  'REP_06',
      KEVIN:    'REP_07',
      MATTEO:   'REP_08',
      RAPHAËL:  'REP_10',
      THOMASL:  'REP_12',
      JULIE:    'REP_13',
      THOMASR:  'REP_14',
      MALLAURY: 'REP_16',
      CHARLOTTE:'REP_17',
    },
    repSheetIds: {
      ÉDOUARD:  '1cvHh8ixHonmZ0FQx2SbmI6Gs4Z1ewhTpMsFXftQY4vo',
      INTISSAR: '1oO-MFOzVm-j3h-D5sbIamea5eA_rW4SGm--Wee89gWU',
      ZINEDINE: '1boQ0atsJX_X7wkcvTrtie5QrS4zauK6HcFVgbzj6uMM',
      MATTEO:   '1I2tZyBGSZN8G8qRh4vb01QwVVaoMLfkAr4JfxG62UZ0',
      KEVIN:    '1fOgy3Uk1kxwZNp5TO3_H17AOI0H-BFU2sW0ptcIQw2o',
      THOMASL:  '1hQQUso_2yVesOrZa-PzgX9ZMV0wTEZUPpH7Swdg9REc',
      THOMASR:  '1kMNkY5y1lGY-wwnxdLDUZSSSmN5c-4aJimR0fHe_77A',
      MALLAURY: '1Wmc0FrXiAjL4LpUDTYoKfGOQBF8-B0br6TA4NOAzuC0',
      LORIS:    '1h_afo4Q_cd6xfFYTgHzF8E-d0Qi-qa0uS5u2LJkL1-8',
      CHARLOTTE:'1mWkYLIz4XjQjJz7n1HJMLjM9IvTUR555UODviUWqTNA',
      JULIE:    '17Jv9uR_pqwq5SjJuqC_Qm579StQXrNQU9ivrGljQoS4',
      RAPHAËL:  '1ST0U5KyNN3EnIGochi76B1nbDBxY0U_eLIkj-Xkb6UM',
    },
    bookingNameMap: {
      'loris mohatta':              'LORIS',
      'intissar youcef':            'INTISSAR',
      'zinedine ayad':              'ZINEDINE',
      'edouard talon':              'ÉDOUARD',
      'mattéo dionot':              'MATTEO',
      'raphaël daumas':             'RAPHAËL',
      'thomas laurent lesserteur':  'THOMASL',
      'julie acalet':               'JULIE',
      'thomas robin':               'THOMASR',
      'mallaury serra':             'MALLAURY',
      'charlotte caillol':          'CHARLOTTE',
      'kevin sgambato':             'KEVIN',
    },
  },
  ra: {
    label: 'Hub Rhône-Alpes',
    masterSheetId: '1sxGlUns4EE7Y6XW0S4knm4uXbqH2mwx4EZdDmL83Opg',
    // No master-sheet aggregation for RA — read each individual sheet directly
    individualReadTab: 'Saisie_RDV',
    repMap: {
      LOUISE:   'RA_01',
      MORGANE:  'RA_02',
      FLORA:    'RA_03',
      MAXIME:   'RA_04',
      MATHILDE: 'RA_05',
      CARLA:    'RA_06',
    },
    repSheetIds: {
      LOUISE:   '1BxVF3fLr1VBoSph5WskBzqUCiyu1pU3n9B673IIhgiU',
      MORGANE:  '1XjRfB9yWLG1GVL_Wamj5J6suXJdONpwPsUksMt5zC-g',
      FLORA:    '1RqGL9x9Y42fkI0XT76kWXYFvgMSm1f8NLWgzE9kPKdo',
      MAXIME:   '1Kfsuhz4HQ2wxcrQssSBOOBTlxkNyKV7lQs6aoAWk0sA',
      MATHILDE: '1y6aEuhXrGwstYmq8Okd8ZvC4Kj5fvgtoOY7-_RFEleo',
      CARLA:    '1wQ030rebxEy0RmA5_HIJxr8nSksIUPaKhF0Osdwz0n4',
    },
    bookingNameMap: {
      'louise guinet':         'LOUISE',
      'morgane cavatz':        'MORGANE',
      'flora devaux':          'FLORA',
      'maxime seguin':         'MAXIME',
      'mathilde scappaticci':  'MATHILDE',
      'carla chenu':           'CARLA',
    },
  },
};

// ── Legacy exports (Hub Sud defaults) — keep existing imports working ──
export const SHEET_ID      = HUB_CONFIG.sud.masterSheetId;
export const REP_MAP       = HUB_CONFIG.sud.repMap;
export const REP_NAMES     = Object.keys(HUB_CONFIG.sud.repMap);
export const REP_ID_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(REP_MAP).map(([name, id]) => [id, name])
);
export const REP_SHEET_IDS  = HUB_CONFIG.sud.repSheetIds;
export const BOOKING_NAME_MAP = HUB_CONFIG.sud.bookingNameMap;

export const READ_SHEET     = 'Saisie_RDV_All';
export const BOOKING_SHEET_ID = '1VBK_rqWLZ-6C1EwDOQlwglLZpliKrGL1vE2XhgIemCE';
export const BOOKING_TAB    = 'Booking overview';

export const KPI_TARGETS = {
  rdvHebdo:       15,
  tauxPresence: 70,
  tauxClosing:  50,
};

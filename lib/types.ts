export interface RDVRow {
  semaine: string;
  commercial: string;
  client: string;
  dateRDV: string;
  heureRDV: string;
  rdvEffectue: 'Oui' | 'Non';
  venteSignee: 'Oui' | 'Non';
  clientActive: 'Oui' | 'Non';
  netRevenue: number | null;
  notes: string;
  rdvValide: 1;
  // Mod 5 — product types (col L, M, N)
  register: boolean;
  contrat: boolean;
  posPlus: boolean;
}

export interface RepStats {
  repName: string;
  repId: string;
  totalRDV: number;
  rdvEffectues: number;
  ventesSignees: number;
  clientsActives: number;
  tauxPresence: number;
  tauxClosing: number;
  tauxActivation: number;
  netRevenue: number;
  // Mod 5
  totalRegister: number;
  totalContrat: number;
  totalPosPlus: number;
}

export interface TeamSummary {
  totalRDV: number;
  totalPresents: number;
  totalVentes: number;
  totalActives: number;
  tauxPresence: number;
  tauxClosing: number;
  tauxActivation: number;
  netRevenue: number;
  // Mod 5
  totalRegister: number;
  totalContrat: number;
  totalPosPlus: number;
}

/** One aggregated day of bookings (col L = booking date) */
export interface BookingEntry {
  repName: string; // e.g. "LORIS"
  date: string;    // YYYY-MM-DD
  count: number;
}

export interface NewRDVPayload {
  hub: string;
  repName: string;
  client: string;
  dateRDV: string;
  heureRDV: string;
  rdvEffectue: boolean;
  venteSignee: boolean;
  clientActive: boolean;
  netRevenue: number | null;
  notes: string;
  // Mod 5
  register: boolean;
  contrat: boolean;
  posPlus: boolean;
}

// ── CRM ──────────────────────────────────────────────────────────────────────

export interface CRMProspect {
  id: string;
  nomClient: string;
  dateRDV: string;       // YYYY-MM-DD or ''
  tpvEstime: number | null;
  dateRelance: string;   // YYYY-MM-DD (legacy from CRM tab — read-only)
  commentaire: string;
  done: boolean;
}

export interface NewCRMPayload {
  hub: string;
  rep: string;
  nomClient: string;
  dateRDV: string;
  tpvEstime: number | null;
  dateRelance: string;
  commentaire: string;
}

export interface UpdateCRMPayload {
  hub: string;
  rep: string;
  id: string;
  nomClient?: string;
  dateRDV?: string;
  tpvEstime?: number | null;
  dateRelance?: string;
  commentaire?: string;
  done?: boolean;
}

// ── CRM Relances (Mod 6) ──────────────────────────────────────────────────────

export interface CRMRelance {
  id: string;
  idProspect: string;
  dateRelance: string;   // YYYY-MM-DD
  commentaire: string;
  done: boolean;
  createdAt: string;     // ISO datetime
}

export interface CRMProspectWithRelances extends CRMProspect {
  relances: CRMRelance[];
}

export interface NewRelancePayload {
  hub: string;
  rep: string;
  idProspect: string;
  dateRelance: string;
  commentaire: string;
}

export interface UpdateRelancePayload {
  hub: string;
  rep: string;
  id: string;
  dateRelance?: string;
  commentaire?: string;
  done?: boolean;
}

// ── Agenda (Mod 7) ────────────────────────────────────────────────────────────

export interface AgendaBooking {
  clientName: string;
  time: string;      // HH:MM or ''
}

export interface AgendaRDV {
  client: string;
  heureRDV: string;
  rdvEffectue: 'Oui' | 'Non';
  venteSignee: 'Oui' | 'Non';
  netRevenue: number | null;
  register: boolean;
  contrat: boolean;
  posPlus: boolean;
}

export interface AgendaDay {
  date: string;              // YYYY-MM-DD
  bookings: AgendaBooking[];
  rdvs: AgendaRDV[];
}

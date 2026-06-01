import { sanitizeInterventionDescriptionForTechnician } from '../../estimates/utils/intervention-description.util';

type InterventionNoteLike = { isInternal?: boolean | null };

export function redactInterventionForTechnician<
  T extends {
    description?: string | null;
    estimatedPrice?: unknown;
    finalPrice?: unknown;
    internalNotes?: string | null;
    notes?: InterventionNoteLike[] | null;
    quotes?: unknown;
    invoice?: unknown;
    history?: unknown;
  },
>(intervention: T): T {
  return {
    ...intervention,
    description: intervention.description
      ? sanitizeInterventionDescriptionForTechnician(intervention.description)
      : intervention.description,
    estimatedPrice: null,
    finalPrice: null,
    internalNotes: null,
    notes: intervention.notes?.filter((note) => !note.isInternal) ?? intervention.notes,
    quotes: undefined,
    invoice: undefined,
    history: undefined,
  };
}

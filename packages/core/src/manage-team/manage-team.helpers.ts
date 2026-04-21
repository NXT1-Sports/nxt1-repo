import type {
  ManageTeamFieldChangeEvent,
  ManageTeamFormData,
  TeamRecord,
} from './manage-team.types';

export interface ManageTeamUpdatePayload {
  readonly teamName: string;
  readonly teamType: string;
  readonly sportName: string;
  readonly mascot: string;
  readonly email: string;
  readonly phone: string;
  readonly website: string;
  readonly address: string;
  readonly city: string;
  readonly state: string;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly season: string;
  readonly logoUrl: string;
  readonly galleryImages: readonly string[];
  readonly primaryColor: string;
  readonly secondaryColor: string;
  readonly accentColor: string;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
  }

  return fallback;
}

function dedupeImages(images: readonly string[] | undefined): readonly string[] {
  return [...new Set((images ?? []).map((image) => image.trim()).filter(Boolean))];
}

function updateRecord(
  record: TeamRecord,
  fieldId: string,
  value: unknown
): ManageTeamFormData['record'] {
  switch (fieldId) {
    case 'wins':
      return { ...record, wins: normalizeNumber(value, record.wins) };
    case 'losses':
      return { ...record, losses: normalizeNumber(value, record.losses) };
    case 'ties':
      return { ...record, ties: normalizeNumber(value, record.ties ?? 0) };
    default:
      return record;
  }
}

export function applyManageTeamFieldChange(
  formData: ManageTeamFormData,
  event: ManageTeamFieldChangeEvent
): ManageTeamFormData {
  const { sectionId, fieldId, value } = event;
  const normalizedFieldId = fieldId.startsWith('contact.')
    ? fieldId.replace('contact.', '')
    : fieldId;

  switch (sectionId) {
    case 'team-info':
    case 'about': {
      if (normalizedFieldId === 'name' || normalizedFieldId === 'title') {
        return {
          ...formData,
          basicInfo: {
            ...formData.basicInfo,
            name: normalizeText(value),
          },
        };
      }

      if (normalizedFieldId === 'mascot') {
        return {
          ...formData,
          basicInfo: {
            ...formData.basicInfo,
            mascot: normalizeText(value) || undefined,
          },
        };
      }

      if (normalizedFieldId === 'sport') {
        return {
          ...formData,
          basicInfo: {
            ...formData.basicInfo,
            sport: normalizeText(value),
          },
        };
      }

      if (normalizedFieldId === 'season') {
        return {
          ...formData,
          basicInfo: {
            ...formData.basicInfo,
            season: normalizeText(value) || undefined,
          },
        };
      }

      return formData;
    }

    case 'contact':
    case 'accounts':
      if (
        normalizedFieldId === 'email' ||
        normalizedFieldId === 'phone' ||
        normalizedFieldId === 'website' ||
        normalizedFieldId === 'address' ||
        normalizedFieldId === 'city' ||
        normalizedFieldId === 'state' ||
        normalizedFieldId === 'zipCode'
      ) {
        return {
          ...formData,
          contact: {
            ...formData.contact,
            [normalizedFieldId]: normalizeText(value) || undefined,
          },
        };
      }
      return formData;

    case 'stats':
      return {
        ...formData,
        record: updateRecord(formData.record, normalizedFieldId, value),
      };

    case 'images': {
      if (normalizedFieldId === 'logo') {
        return {
          ...formData,
          branding: {
            ...formData.branding,
            logo: normalizeText(value) || undefined,
          },
        };
      }

      if (normalizedFieldId === 'galleryImages' && Array.isArray(value)) {
        return {
          ...formData,
          branding: {
            ...formData.branding,
            galleryImages: dedupeImages(
              value.filter((item): item is string => typeof item === 'string')
            ),
          },
        };
      }

      if (normalizedFieldId === 'primaryColor' || normalizedFieldId === 'secondaryColor') {
        return {
          ...formData,
          branding: {
            ...formData.branding,
            [normalizedFieldId]: normalizeText(value) || formData.branding[normalizedFieldId],
          },
        };
      }

      if (normalizedFieldId === 'accentColor') {
        return {
          ...formData,
          branding: {
            ...formData.branding,
            accentColor: normalizeText(value) || undefined,
          },
        };
      }

      return formData;
    }

    default:
      return formData;
  }
}

export function buildManageTeamUpdatePayload(
  formData: ManageTeamFormData
): ManageTeamUpdatePayload {
  return {
    teamName: normalizeText(formData.basicInfo.name),
    teamType: formData.basicInfo.level,
    sportName: normalizeText(formData.basicInfo.sport),
    mascot: normalizeText(formData.basicInfo.mascot ?? ''),
    email: normalizeText(formData.contact.email ?? ''),
    phone: normalizeText(formData.contact.phone ?? ''),
    website: normalizeText(formData.contact.website ?? ''),
    address: normalizeText(formData.contact.address ?? ''),
    city: normalizeText(formData.contact.city ?? ''),
    state: normalizeText(formData.contact.state ?? ''),
    wins: normalizeNumber(formData.record.wins),
    losses: normalizeNumber(formData.record.losses),
    ties: normalizeNumber(formData.record.ties ?? 0),
    season: normalizeText(formData.basicInfo.season ?? ''),
    logoUrl: normalizeText(formData.branding.logo ?? ''),
    galleryImages: dedupeImages(formData.branding.galleryImages),
    primaryColor: normalizeText(formData.branding.primaryColor),
    secondaryColor: normalizeText(formData.branding.secondaryColor),
    accentColor: normalizeText(formData.branding.accentColor ?? ''),
  };
}

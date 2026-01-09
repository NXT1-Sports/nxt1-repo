/**
 * @fileoverview Location Constants
 * @module @nxt1/core/constants
 *
 * US States and Countries data with helper functions.
 * 100% portable - no framework dependencies.
 *
 * @author NXT1 Engineering
 * @version 2.0.0
 */

// ============================================
// STATE TYPES
// ============================================

export interface USState {
  name: string;
  abbreviation: string;
}

// ============================================
// US STATES
// ============================================

export const US_STATES: readonly USState[] = [
  { name: 'Alabama', abbreviation: 'AL' },
  { name: 'Alaska', abbreviation: 'AK' },
  { name: 'Arizona', abbreviation: 'AZ' },
  { name: 'Arkansas', abbreviation: 'AR' },
  { name: 'California', abbreviation: 'CA' },
  { name: 'Colorado', abbreviation: 'CO' },
  { name: 'Connecticut', abbreviation: 'CT' },
  { name: 'Delaware', abbreviation: 'DE' },
  { name: 'Florida', abbreviation: 'FL' },
  { name: 'Georgia', abbreviation: 'GA' },
  { name: 'Hawaii', abbreviation: 'HI' },
  { name: 'Idaho', abbreviation: 'ID' },
  { name: 'Illinois', abbreviation: 'IL' },
  { name: 'Indiana', abbreviation: 'IN' },
  { name: 'Iowa', abbreviation: 'IA' },
  { name: 'Kansas', abbreviation: 'KS' },
  { name: 'Kentucky', abbreviation: 'KY' },
  { name: 'Louisiana', abbreviation: 'LA' },
  { name: 'Maine', abbreviation: 'ME' },
  { name: 'Maryland', abbreviation: 'MD' },
  { name: 'Massachusetts', abbreviation: 'MA' },
  { name: 'Michigan', abbreviation: 'MI' },
  { name: 'Minnesota', abbreviation: 'MN' },
  { name: 'Mississippi', abbreviation: 'MS' },
  { name: 'Missouri', abbreviation: 'MO' },
  { name: 'Montana', abbreviation: 'MT' },
  { name: 'Nebraska', abbreviation: 'NE' },
  { name: 'Nevada', abbreviation: 'NV' },
  { name: 'New Hampshire', abbreviation: 'NH' },
  { name: 'New Jersey', abbreviation: 'NJ' },
  { name: 'New Mexico', abbreviation: 'NM' },
  { name: 'New York', abbreviation: 'NY' },
  { name: 'North Carolina', abbreviation: 'NC' },
  { name: 'North Dakota', abbreviation: 'ND' },
  { name: 'Ohio', abbreviation: 'OH' },
  { name: 'Oklahoma', abbreviation: 'OK' },
  { name: 'Oregon', abbreviation: 'OR' },
  { name: 'Pennsylvania', abbreviation: 'PA' },
  { name: 'Rhode Island', abbreviation: 'RI' },
  { name: 'South Carolina', abbreviation: 'SC' },
  { name: 'South Dakota', abbreviation: 'SD' },
  { name: 'Tennessee', abbreviation: 'TN' },
  { name: 'Texas', abbreviation: 'TX' },
  { name: 'Utah', abbreviation: 'UT' },
  { name: 'Vermont', abbreviation: 'VT' },
  { name: 'Virginia', abbreviation: 'VA' },
  { name: 'Washington', abbreviation: 'WA' },
  { name: 'West Virginia', abbreviation: 'WV' },
  { name: 'Wisconsin', abbreviation: 'WI' },
  { name: 'Wyoming', abbreviation: 'WY' },
  // Territories
  { name: 'District of Columbia', abbreviation: 'DC' },
  { name: 'Puerto Rico', abbreviation: 'PR' },
  { name: 'Guam', abbreviation: 'GU' },
  { name: 'Virgin Islands', abbreviation: 'VI' },
] as const;

export type StateAbbreviation = (typeof US_STATES)[number]['abbreviation'];

// ============================================
// COUNTRY TYPES
// ============================================

export interface Country {
  name: string;
  code: string;
}

// ============================================
// COUNTRIES
// ============================================

export const COUNTRIES: readonly Country[] = [
  { name: 'United States', code: 'US' },
  { name: 'Canada', code: 'CA' },
  { name: 'United Kingdom', code: 'GB' },
  { name: 'Australia', code: 'AU' },
  { name: 'Germany', code: 'DE' },
  { name: 'France', code: 'FR' },
  { name: 'Japan', code: 'JP' },
  { name: 'Mexico', code: 'MX' },
  { name: 'Brazil', code: 'BR' },
  { name: 'China', code: 'CN' },
  { name: 'India', code: 'IN' },
  { name: 'South Korea', code: 'KR' },
  { name: 'Italy', code: 'IT' },
  { name: 'Spain', code: 'ES' },
  { name: 'Netherlands', code: 'NL' },
  { name: 'Sweden', code: 'SE' },
  { name: 'Switzerland', code: 'CH' },
  { name: 'Argentina', code: 'AR' },
  { name: 'Belgium', code: 'BE' },
  { name: 'Austria', code: 'AT' },
  { name: 'Norway', code: 'NO' },
  { name: 'Denmark', code: 'DK' },
  { name: 'Finland', code: 'FI' },
  { name: 'Ireland', code: 'IE' },
  { name: 'New Zealand', code: 'NZ' },
  { name: 'Portugal', code: 'PT' },
  { name: 'Poland', code: 'PL' },
  { name: 'Russia', code: 'RU' },
  { name: 'South Africa', code: 'ZA' },
  { name: 'Nigeria', code: 'NG' },
  { name: 'Egypt', code: 'EG' },
  { name: 'Kenya', code: 'KE' },
  { name: 'Ghana', code: 'GH' },
  { name: 'Turkey', code: 'TR' },
  { name: 'Israel', code: 'IL' },
  { name: 'United Arab Emirates', code: 'AE' },
  { name: 'Saudi Arabia', code: 'SA' },
  { name: 'Singapore', code: 'SG' },
  { name: 'Thailand', code: 'TH' },
  { name: 'Vietnam', code: 'VN' },
  { name: 'Philippines', code: 'PH' },
  { name: 'Indonesia', code: 'ID' },
  { name: 'Malaysia', code: 'MY' },
  { name: 'Taiwan', code: 'TW' },
  { name: 'Hong Kong', code: 'HK' },
  { name: 'Colombia', code: 'CO' },
  { name: 'Chile', code: 'CL' },
  { name: 'Peru', code: 'PE' },
  { name: 'Venezuela', code: 'VE' },
  { name: 'Jamaica', code: 'JM' },
  { name: 'Bahamas', code: 'BS' },
  { name: 'Dominican Republic', code: 'DO' },
  { name: 'Puerto Rico', code: 'PR' },
  { name: 'Costa Rica', code: 'CR' },
  { name: 'Panama', code: 'PA' },
  { name: 'Greece', code: 'GR' },
  { name: 'Czech Republic', code: 'CZ' },
  { name: 'Hungary', code: 'HU' },
  { name: 'Romania', code: 'RO' },
  { name: 'Ukraine', code: 'UA' },
  { name: 'Croatia', code: 'HR' },
  { name: 'Slovenia', code: 'SI' },
  { name: 'Slovakia', code: 'SK' },
  { name: 'Serbia', code: 'RS' },
  { name: 'Bulgaria', code: 'BG' },
  { name: 'Iceland', code: 'IS' },
  { name: 'Luxembourg', code: 'LU' },
  { name: 'Lithuania', code: 'LT' },
  { name: 'Latvia', code: 'LV' },
  { name: 'Estonia', code: 'EE' },
  { name: 'Other', code: 'XX' },
] as const;

export type CountryCode = (typeof COUNTRIES)[number]['code'];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get state by abbreviation
 */
export function getStateByAbbreviation(abbr: string): USState | undefined {
  return US_STATES.find((s) => s.abbreviation === abbr.toUpperCase());
}

/**
 * Get state by name
 */
export function getStateByName(name: string): USState | undefined {
  const normalized = name.toLowerCase().trim();
  return US_STATES.find((s) => s.name.toLowerCase() === normalized);
}

/**
 * Get country by code
 */
export function getCountryByCode(code: string): Country | undefined {
  return COUNTRIES.find((c) => c.code === code.toUpperCase());
}

/**
 * Get country by name
 */
export function getCountryByName(name: string): Country | undefined {
  const normalized = name.toLowerCase().trim();
  return COUNTRIES.find((c) => c.name.toLowerCase() === normalized);
}

/**
 * Format state for display (e.g., "CA" -> "California, CA")
 */
export function formatStateDisplay(abbr: string): string {
  const state = getStateByAbbreviation(abbr);
  return state ? `${state.name}, ${state.abbreviation}` : abbr;
}

/**
 * Format location for display (e.g., "Los Angeles, CA")
 */
export function formatLocationDisplay(city: string, state: string): string {
  return `${city}, ${state}`;
}

/**
 * Search states by partial name or abbreviation
 */
export function searchStates(query: string): readonly USState[] {
  if (!query?.trim()) return US_STATES;

  const normalized = query.toLowerCase().trim();
  return US_STATES.filter(
    (s) =>
      s.name.toLowerCase().includes(normalized) ||
      s.abbreviation.toLowerCase().includes(normalized)
  );
}

/**
 * Search countries by partial name or code
 */
export function searchCountries(query: string): readonly Country[] {
  if (!query?.trim()) return COUNTRIES;

  const normalized = query.toLowerCase().trim();
  return COUNTRIES.filter(
    (c) =>
      c.name.toLowerCase().includes(normalized) ||
      c.code.toLowerCase().includes(normalized)
  );
}

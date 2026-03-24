/**
 * @fileoverview Avatar Component Utilities
 * @module @nxt1/ui/components/avatar
 * @version 1.0.0
 *
 * Pure utility functions for avatar operations.
 * These are portable and can be used anywhere.
 */

import { AVATAR_INITIALS_COLORS } from './avatar.types';

/**
 * Extract initials from a name string
 *
 * Follows common patterns:
 * - "John Doe" → "JD"
 * - "john.doe@email.com" → "JD"
 * - "John" → "JO"
 * - "J" → "J"
 * - "" or null → "?"
 *
 * @param name - Full name or identifier
 * @returns 1-2 character initials, uppercase
 */
export function extractInitials(name: string | null | undefined): string {
  if (!name || typeof name !== 'string') {
    return '?';
  }

  // Clean the input
  const cleaned = name.trim();
  if (!cleaned) {
    return '?';
  }

  // Handle email addresses
  if (cleaned.includes('@')) {
    const localPart = cleaned.split('@')[0];
    // Handle formats like "john.doe" or "johndoe"
    const parts = localPart.split(/[._-]/);
    if (parts.length >= 2 && parts[0] && parts[1]) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    // Single part email
    return localPart.substring(0, 2).toUpperCase();
  }

  // Split by whitespace
  const parts = cleaned.split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return '?';
  }

  if (parts.length === 1) {
    // Single word: take first two characters
    const word = parts[0];
    return word.length >= 2 ? `${word[0]}${word[1]}`.toUpperCase() : word[0].toUpperCase();
  }

  // Multiple words: first letter of first and last word
  const first = parts[0][0];
  const last = parts[parts.length - 1][0];
  return `${first}${last}`.toUpperCase();
}

/**
 * Generate a consistent color for a given string
 *
 * Uses a simple hash function to always return the same color
 * for the same input string. This ensures avatars look consistent
 * across sessions and renders.
 *
 * @param str - String to hash (typically name or email)
 * @returns Hex color string from the palette
 */
export function getInitialsColor(str: string | null | undefined): string {
  if (!str) {
    return AVATAR_INITIALS_COLORS[0];
  }

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Use absolute value and modulo to get index
  const index = Math.abs(hash) % AVATAR_INITIALS_COLORS.length;
  return AVATAR_INITIALS_COLORS[index];
}

/**
 * Calculate contrasting text color for a background
 *
 * Uses relative luminance to determine if text should be
 * white or dark for optimal readability.
 * Handles both raw hex values and CSS variable strings.
 *
 * @param color - Background color in hex format or CSS var() string
 * @returns 'white' or 'rgba(0,0,0,0.87)' for text color
 */
export function getContrastingTextColor(color: string): string {
  let hexColor = color;

  // Handle CSS custom property strings — extract fallback hex for contrast calc
  if (color.startsWith('var(')) {
    const match = color.match(/#[0-9a-fA-F]{6}/);
    if (match) {
      hexColor = match[0];
    } else {
      // No fallback hex found — default to dark text (safe for light/primary backgrounds)
      return 'rgba(0, 0, 0, 0.87)';
    }
  }

  // Remove # if present
  const hex = hexColor.replace('#', '');

  // Parse RGB values
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Calculate relative luminance (WCAG formula)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // Return white for dark backgrounds, dark for light backgrounds
  return luminance > 0.5 ? 'rgba(0, 0, 0, 0.87)' : 'white';
}

/**
 * Format count for badge display
 *
 * @param count - Numeric count
 * @param max - Maximum to display before showing "99+"
 * @returns Formatted string
 */
export function formatBadgeCount(count: number, max: number = 99): string {
  if (count <= 0) return '';
  if (count > max) return `${max}+`;
  return count.toString();
}

/**
 * Validate and sanitize image URL
 *
 * @param url - Image URL to validate
 * @returns Sanitized URL or null if invalid
 */
export function sanitizeImageUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') {
    return null;
  }

  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  // Allow data URLs, http(s), and relative paths
  if (
    trimmed.startsWith('data:') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../')
  ) {
    return trimmed;
  }

  // Assume relative path if no protocol
  return trimmed;
}

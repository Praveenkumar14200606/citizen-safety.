/**
 * Relative time formatting (e.g. "Just now", "2m ago", "1h ago")
 */
export function formatRelativeTime(isoString: string): string {
  if (!isoString) return 'Unknown';
  const now = Date.now();
  const past = new Date(isoString).getTime();
  const diffSec = Math.floor((now - past) / 1000);

  if (diffSec < 10) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

/**
 * Standard readable date time formatting
 */
export function formatDateTime(isoString: string): string {
  if (!isoString) return 'N/A';
  try {
    const d = new Date(isoString);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return isoString;
  }
}

/**
 * Privacy helper to mask citizen identity for unauthorized view
 */
export function maskCitizenName(name?: string): string {
  if (!name || name.trim() === '') return 'Citizen in need';
  const parts = name.trim().split(' ');
  if (parts.length === 1) {
    return `${parts[0][0]}.`;
  }
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

/**
 * Phone number validation and standard E.164 cleaner
 */
export function sanitizePhoneNumber(phone: string): string {
  // Strip spaces, dashes, parentheses
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (!cleaned.startsWith('+')) {
    // If no country code, default to international format if 10 digits
    if (cleaned.length === 10) {
      return `+1${cleaned}`;
    }
  }
  return cleaned;
}

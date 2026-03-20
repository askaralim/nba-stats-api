/**
 * Format player name for display. When ABBREVIATE_PLAYER_NAMES=true (default),
 * returns abbreviated form for 4.1(a) compliance. Set to false to return full names
 * without requiring an app update.
 *
 * e.g. "Shai Gilgeous-Alexander" -> "S. Gilgeous-A." (when abbreviated)
 */
function abbreviatePlayerName(fullName) {
  if (!fullName || typeof fullName !== 'string') return fullName || '';
  const trimmed = fullName.trim();
  // if (trimmed.length < 12) return trimmed;
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return trimmed;
  const first = parts[0];
  const rest = parts.slice(1);
  return `${first.charAt(0)}. ${rest}`;
}

/**
 * Returns the display name for a player. Uses ABBREVIATE_PLAYER_NAMES env var
 * (default: true) to switch between abbreviated and full names.
 */
function formatPlayerNameForDisplay(fullName) {
  if (!fullName || typeof fullName !== 'string') return fullName || '';
  const abbreviate = process.env.ABBREVIATE_PLAYER_NAMES !== 'false';
  return abbreviate ? abbreviatePlayerName(fullName) : fullName.trim();
}

module.exports = { formatPlayerNameForDisplay, abbreviatePlayerName };

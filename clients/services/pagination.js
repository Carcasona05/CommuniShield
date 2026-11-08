export const itemKey = (row) => `${row.postSource || "User"}:${row.id}`;

export function mergeUniqueItems(previous, incoming, key = itemKey) {
  const result = [...previous];
  const positions = new Map(result.map((row, index) => [key(row), index]));
  for (const row of incoming) {
    const id = key(row);
    if (positions.has(id)) result[positions.get(id)] = row;
    else { positions.set(id, result.length); result.push(row); }
  }
  return result;
}

export function mergeComments(previous, incoming) {
  return mergeUniqueItems(previous, incoming, row => row.id).sort((a, b) => {
    const time = Date.parse(a.datePosted) - Date.parse(b.datePosted);
    if (Number.isFinite(time) && time !== 0) return time;
    // JS dates truncate sub-millisecond precision; preserve database ordering
    // for comments saved in the same millisecond before comparing their UUIDs.
    const fraction = value => String(value).match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/)?.[1]?.padEnd(9, "0") || "000000000";
    const left = fraction(a.datePosted), right = fraction(b.datePosted);
    return (left < right ? -1 : left > right ? 1 : 0) || String(a.id).localeCompare(String(b.id));
  });
}

/** Query-string list transforms. Validation decorators sit on the DTO fields. */

/** "5,4" -> [5, 4]. Numeric items become numbers; other items are kept for validators to reject. */
export const toIntList = ({ value }: { value: unknown }): unknown => {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return value;
  return splitCsv(value).map((item) => (/^-?\d+$/.test(item) ? Number(item) : item));
};

/** "Pool,Spa" -> ["Pool","Spa"]. Labels keep their case. */
export const toStringList = ({ value }: { value: unknown }): unknown => {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return value;
  return splitCsv(value);
};

/** "Hotel,resort" -> ["HOTEL","RESORT"]. For enum lists sent as labels or codes. */
export const toCodeList = ({ value }: { value: unknown }): unknown => {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return value;
  return splitCsv(value).map((item) => item.toUpperCase().replace(/[ -]/g, "_"));
};

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

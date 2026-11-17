/** Csv voor Nederlands Excel: puntkomma als scheiding, komma als decimaalteken, BOM voor é en ë. */

export const csvNum = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/** Tekstcel tussen aanhalingstekens. Een = + - @ aan het begin krijgt een ' ervoor, zodat Excel het niet als formule leest. */
export const csvCell = (value: string) => {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
};

export function csvResponse(rows: string[][], filename: string) {
  const body = "﻿" + rows.map((r) => r.join(";")).join("\r\n") + "\r\n";
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

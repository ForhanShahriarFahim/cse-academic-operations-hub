"use client";

import { useEffect, useState } from "react";

const stamp = () => new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Dhaka", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
}).format(new Date());

/**
 * Heading that appears only on paper for working-draft ledgers: institution,
 * page, term, publication state, and the moment of printing (Asia/Dhaka).
 */
export function PrintHeader({ title, termName, publishedVersion }: {
  title: string;
  termName: string;
  /** Published version of the active term, or null while only a draft exists. */
  publishedVersion: number | null;
}) {
  const [printedAt, setPrintedAt] = useState("");
  useEffect(() => {
    const update = () => setPrintedAt(stamp());
    update();
    window.addEventListener("beforeprint", update);
    return () => window.removeEventListener("beforeprint", update);
  }, []);
  // Ledgers are computed from the working draft, even when a version is published.
  const state = publishedVersion == null
    ? "Working draft — routine not yet published"
    : `Working draft — published routine is version ${publishedVersion}`;
  return (
    <div className="print-only mb-[4mm] border-b-[1.5px] border-black pb-[3mm]" aria-hidden="true">
      <div className="flex items-end justify-between gap-6">
        <div>
          <p className="font-display text-[13pt] font-bold leading-tight">Pundra University of Science &amp; Technology</p>
          <p className="text-[9pt]">Department of Computer Science &amp; Engineering</p>
        </div>
        <p className="text-right text-[8.5pt] leading-snug">
          {title} · {termName}<br />{state}<br />Printed {printedAt} (Asia/Dhaka)
        </p>
      </div>
    </div>
  );
}

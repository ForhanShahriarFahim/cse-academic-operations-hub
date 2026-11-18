"use client";

import { useRef, useState, type MouseEvent } from "react";
import { secondaryClass } from "./styles";

const options = [{ format: "csv", label: "CSV" }, { format: "xlsx", label: "Excel" }] as const;

export function RosterDownloads({ query, termId, groupId }: { query: string; termId: number; groupId: number }) {
  const busy = useRef(false);
  const [message, setMessage] = useState("");

  async function download(event: MouseEvent<HTMLAnchorElement>, format: "csv" | "xlsx", label: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setMessage(`Preparing ${label}…`);
    try {
      const response = await fetch(event.currentTarget.href, { cache: "no-store" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setMessage(typeof body?.error === "string" ? body.error : "The roster file could not be prepared. Try again.");
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `roster-term-${termId}-group-${groupId}.${format}`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setMessage(`${label} roster ready.`);
    } catch {
      setMessage("The roster file could not be prepared. Try again.");
    } finally {
      busy.current = false;
    }
  }

  return <>
    <div className="flex flex-wrap gap-2">
      <a className={secondaryClass} href="#import-students">Import students</a>
      {options.map(({ format, label }) => <a className={secondaryClass} key={format}
        href={`/attendance/roster/export?${query}&format=${format}`} onClick={event => void download(event, format, label)}>Download {label}</a>)}
      <a className={secondaryClass} href={`/attendance/roster/print?${query}&from=roster`}>Printable roll-call</a>
    </div>
    <p className="text-sm not-empty:mt-2" role="status">{message}</p>
  </>;
}

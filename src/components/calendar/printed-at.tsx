"use client";
import { useEffect, useState } from "react";

const stamp = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());

/** The moment of printing in Asia/Dhaka; refreshed just before the print dialog opens. */
export function PrintedAt({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    const update = () => setValue(stamp());
    update();
    window.addEventListener("beforeprint", update);
    return () => window.removeEventListener("beforeprint", update);
  }, []);
  return <>Printed {value} (Asia/Dhaka)</>;
}

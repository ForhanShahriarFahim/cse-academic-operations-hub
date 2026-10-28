import Link from "next/link";
export default function MissingRoom() { return <div className="p-4"><h1 className="font-display text-xl font-semibold">Room not found</h1><p className="my-3 text-sm">This room may no longer exist, or the address is invalid.</p><Link className="underline" href="/rooms">Back to Rooms</Link></div>; }

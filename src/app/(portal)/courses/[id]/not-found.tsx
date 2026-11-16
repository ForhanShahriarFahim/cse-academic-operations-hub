import Link from "next/link";
export default function CourseNotFound() { return <div><h1 className="font-display text-2xl">Course not found</h1><p className="mt-3">This course is unavailable. <Link href="/courses" className="underline">Return to the catalog</Link>.</p></div>; }

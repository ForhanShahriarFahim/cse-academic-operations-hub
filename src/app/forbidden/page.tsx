import Link from "next/link";
export default function ForbiddenPage() {
  return <main className="mx-auto max-w-xl p-12"><h1 className="font-display text-3xl font-semibold">Access not granted</h1><p className="mt-3">Your account is signed in but has no permission to view this area. Contact the portal administrator.</p><Link className="mt-5 inline-block underline" href="/public/routine">Public routine</Link></main>;
}

import { redirect } from "next/navigation";
import { can, getOptionalActor, type Capability } from "./auth";
export async function requireTermPage(capability: Capability) {
  const actor=await getOptionalActor();if(!actor)redirect("/login");
  if(!await can(actor,capability))redirect("/forbidden");
  return actor;
}

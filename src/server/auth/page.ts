import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateOwner } from "./actors";
import { AccessError } from "./access";

export async function requireOwnerPage() {
  try { return await authenticateOwner(await headers()); }
  catch (error) {
    if (error instanceof AccessError) redirect("/sign-in");
    throw error;
  }
}

import { redirect } from "next/navigation";

export default async function ReviewRoutePage() {
  redirect("/comments");
}

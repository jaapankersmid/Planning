import { redirect } from "next/navigation";

/** Beschikbaarheid geef je nu door in Mijn rooster; oude links en bladwijzers komen daar uit. */
export default function BeschikbaarheidPage() {
  redirect("/rooster/mijn");
}

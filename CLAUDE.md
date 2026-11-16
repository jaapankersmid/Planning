@AGENTS.md

# Rooster-app (Planning)

Rooster, verlof, uren en beschikbaarheid voor Bréborgh. Next.js (App Router), Prisma, next-auth.
Repo: `jaapankersmid/Planning`. Eigenaar: Jaap Ankersmid.

## Afspraken voor Claude
- **Antwoord altijd in het Nederlands.**
- Controleer wijzigingen met `npx eslint <bestanden>` en `npx tsc --noEmit`. Na schemawijzigingen eerst `npx prisma generate`.
- Wees eerlijk over wat niet getest is.
- Voeg bij elke nieuwe feature een korte sectie toe aan `README.md`.
- Zeg na elke wijziging expliciet of `prisma db push` nodig is. **Bevestig nooit** een `db push` die waarschuwt voor dataverlies: meld het aan Jaap.
- Claude commit en pusht zelf na elke afgeronde, gecontroleerde wijziging (Nederlands commitbericht, op `main`).

## Privacy: Planvoorstel
De functie **Planvoorstel** (automatisch plannen) mag alleen zichtbaar en bruikbaar zijn voor **jaapankersmid@gmail.com**.
Gebruik altijd `canAutoPlan(email)`, `requireAutoPlan()` en `assertAutoPlan()` (`src/lib/auto-plan-access.ts` en `auto-plan-guard.ts`); toon het nergens aan anderen, ook niet in navigatie of API's.

## Opbouw
- Het rooster kent één dienst per medewerker per dag. Een gebroken dienst (ochtend + middag, bv. X) bestaat ook als losse delen (XI ochtend, IX middag): zie `src/lib/shift-swap.ts` (`pieces`, `combine`, `remainderOf`).
- Diensten wijzigen altijd via `applyAssignment` (`src/lib/assignments.ts`): dat regelt agenda-sync en roostermail.
- Verlof (`src/lib/leave.ts`): hele dagen worden V (Vrij); een aanvraag voor één dienst (dagdeel vrij of andere dienst) wijzigt alleen die dienst (`isShiftRequest`).
- Ruilen met een collega: `ShiftSwapRequest`, `src/lib/shift-swap.ts`.
- Planvoorstel: `src/lib/auto-plan.ts` (PlanTag/PlanNeed, bestaande diensten tellen mee voor de wens als ze de tag-tijden omvatten, ook lange diensten als O 8:00-17:00 en A 10:30-19:30; tags worden gevuld op prioriteit = `sortOrder`, bovenste eerst, harde volgorde).

## Deploy
Commit en push doet Claude zelf. Het bijwerken van de server doet Jaap zelf (`root@ubuntu`):
```
cd ~/Planning; git pull; docker compose -f docker-compose.prod.yml up -d --build app; docker compose -f docker-compose.prod.yml exec app npx prisma db push; docker compose -f docker-compose.prod.yml logs --tail=30 app
```
Laat `exec app npx prisma db push` weg als het schema niet is gewijzigd. Geef na elke wijziging de serverstappen kant-en-klaar onder het kopje "Op de server".

## Openstaande `db push`-punten (controleer of ze zijn uitgevoerd)
ShiftSwapRequest, Plan*-tabellen, `ColorGroup.planParticipates`, tijdvelden van PlanTag, en de velden `part`, `shiftTypeId`, `swapShiftTypeId`, `swapDate` op LeaveRequest.

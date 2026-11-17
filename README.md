# PoortRush

Snelle 2.5D arcade lane-shooter gebaseerd op de directe actie uit mobiele game-reclames — zonder basisbeheer, energiebalken of wachttijden.

**Versie 1.2.5** · [Releases](https://github.com/KarelTestSpecial/top-shooter/releases)

## Functies

- **Schuif & Auto-Vuur**: Bestuur je squad vloeiend met muis, touch of toetsenbord (`A`/`D` of pijltjestoetsen).
- **Luchtaanval (`Spatie` of tik-knop)**: Laadt op tijdens het spelen en dropt 6 explosieve raketten over de hele breedte van de brug.
- **Rekenpoortjes & Opschiet-poorten**: Kies tussen `+`, `×`, vuursnelheid-, schade-, schild-, drone- en goudkoorts-poortjes, of schiet negatieve rode poortjes omhoog zodat ze positief worden. Er zijn ook mysterie-poortjes. Vanaf Stage 2 schuiven sommige poortjes over de brug.
- **Innovatieve situaties** (frequentie instelbaar, standaard 100%):
  - **Veld-pickups**: zwevende MAGNEET-, FRENZY-, NUKE- en soldaten-pickups die je verzamelt door erover te rijden.
  - **Nieuwe vijanden**: JUMPER (springt over kogels), MEDIC (geneest nabije golven), MORTAR (telegrafeert artillerie-inslagen), SHIELD_UNIT (energieschild dat eerst breekt) en BERSERKER (chargt en slaat hard toe).
  - **Nieuwe poorten**: `TIJDSTIL` (bevriest alle vijanden), `+SCHOT` (extra projectielen), `DOORBOOR` (piercing), `HERSTEL` (herstelt een deel van je leger), `SNEL` (tijdsversnelling), `FORT` (tijdelijke vuurkracht-boost), `BLITZ` (snellere vuursnelheid) en `VAMP` (levensherstel uit schade).
  - **Nieuwe eindbaas**: vanaf stage 4 verschijnt het *Vliegdekschip* (CARRIER) dat bommenwerpers lanceert en spervuur afvuurt.
  - **Doelwitlaser-scans**: vijandelijke satellietlasers markeren een baan en slaan na een korte waarschuwing toe.
- **Tonnen, Kratten & TNT**:
  - **TNT-vaten**: Ontploffen in een grote kettingreactie (ruime blastradius) en schakelen omliggende vijanden en tonnen uit.
  - **Wapenkisten**: Live upgrades van Rifle naar Dubbel-SMG, 3-Way Shotgun, Raketwerper en doorborend Plasmakanon.
  - **Schild- & Dronekratten**: Voeg beschermende energieschilden en flankerende aanvalsdrones toe. Drones zijn kwetsbaar: vijandelijk vuur kan ze raken en vernietigen.
  - **Cryo-, Hyper- & Tesla-kratten**: Vertraag alle vijanden, laad je hypervuur op of ontketen een bliksemketting die met de stage meer vijanden raakt (tot 10) over een ruimere straal.
  - **Goudkluizen**: Grote goudbeloningen voor wie de tijd neemt om ze open te breken.
- **Barricades**: versperringen op de brug — schiet ze op tijd neer of je squad verliest soldaten.
- **Vijanden**: rushers, raiders, turrets, brutes en bommers, plus sluipschutters met lang bereik en splitters die bij hun dood in twee groepen uiteenvallen.
- **Combo-Streak & Hypervuur**: Snelle eliminaties bouwen je Combo op voor hogere kritieke trefferkans en laden Hypervuur op (`2×` goud en extra vuursnelheid).
- **Afwisselende Biomes & Eindbazen**: Wisselt tussen *Kustbrug*, *Woestijnkloof* en *Nacht-Reactor*, elk afgesloten door een eindbaas (tank, heli, mech of carrier) met een Woede-Fase onder 55% HP.
- **Directe Upgrades**: Besteed goud tussen rondes direct aan **Start-Squad**, **Vuurkracht**, **Vuursnelheid** en **Goudbonus**, of laat de **Verdeel goud**-knop het hele bedrag in één keer over de vier categorieën spreiden. De standaardverdeling is gelijk (25/25/25/25); met de **verdeelsleutel** stel je zelf de relatieve gewichten in (bv. 50/20/20/10). Wat per categorie niet koopbaar is, schuift door naar de goedkoopste beschikbare upgrade.
- **3 Opslag-slots & Clean Slate**: Sla je volledige spelersstatus (goud, upgrades, record, hoogste stage, kills en instellingen) op in één van de 3 slots, laad een status later terug, of begin met een **clean slate** (de slots blijven bewaard).

## Balans

- **Lange stages**: standaard **1,0×** (12 middenblokken, 1330u op stage 1; instelbaar van 0,2× kort tot 1,8× extra lang). Vanaf **stage 15** komt er 1 extra middenblok bij per 4 stages (max. +4, en nooit meer dan 60% bovenop de gekozen lengte), zodat de latere stages blijven beklijven: stage 15 op de standaardlengte telt 1425u en stage 27+ telt 1710u.
- **Rustig tempo**: standaard 100% spelsnelheid (herijkt vanaf de vroegere 80%-snelheid).
- **Paarse MAX-poortjes**: standaard 15% frequentie, waarvan 15% dubbel naast elkaar.
- **Innovatieve situaties**: standaard 100% — veld-pickups, nieuwe vijandtypes, nieuwe poorten en doelwitlaser-scans. Op 0% speelt alles zoals v1.0.
- **Vijand-druk**: standaard 130% HP en 115% horde-dichtheid, max. 120 vijanden per golf.
- **Vlakke power-curve**: squad-schade groeit als `squad^0.6`; vijanden schalen zacht mee met je squad.
- **Geleidelijke moeilijkheid**: vijanden worden per stage licht talrijker en taaier. Vanaf **stage 11** vlakt die groei af (HP ×1.10, aantal ×1.08 per stage) en groeit je eigen vuurkracht mee (×1.15 per stage), zodat stage 11 geen plotselinge muur is. Stages 1–10 zijn ongewijzigd.
- **Eindbazen schalen mee met je vuurkracht**: standaard op `2,0×` sterkte (midden van `0,4× .. 3,6×`) en basis-HP `1650 × stage-curve`. Bij het spawnen schaalt een eindbaas gebalanceerd mee met je squad-grootte (`^0,44`, max ×2,6), wapen-tier (RIFLE 1,0 → LASER 2,2), upgrades, drones en tijdelijke poort-buffs (`^0,45`, max ×4,0).
- **Vliegdekschip-baas**: de CARRIER (stages 4, 8, 12, …) heeft **40% meer HP** dan de andere eindbazen, schuift sneller heen en weer en combineert zijn bommenwerpergolven met een spervuur, zodat hij niet meer als een zittend doelwit weggeklikt kan worden.
- **Drie voorinstellingen**: *Standaard Arcade* (100% tempo, 1,0× stages), *Snelle Chaos* (175% tempo, 175% HP) en *Oppermacht Sandbox* (plasmakanon, ∞ soldaten, 5 drones).
- **Instelbaar**: tempo, stage-lengte, vijand-HP, horde-dichtheid, leger-limiet, goud-bonus, mini- en eindbazen, start-schild/-drones, startwapen, arena/biome, paarse MAX-poortjes (frequentie, dubbel/enkel, min/max-hoogte) en de frequentie van innovatieve situaties.

## Lokaal draaien

```bash
pnpm install
pnpm dev
```

Open daarna `http://localhost:3000`. (`npm install` + `npm run dev` werkt ook.)

Productiebuild controleren:

```bash
pnpm build
pnpm preview
```

Geen API-sleutel of omgevingsvariabele nodig — het spel draait volledig client-side.

# PoortRush

Snelle 2.5D arcade lane-shooter gebaseerd op de directe actie uit mobiele game-reclames — zonder basisbeheer, energiebalken of wachttijden.

**Versie 1.0.0** · [Releases](https://github.com/KarelTestSpecial/top-shooter/releases)

## Functies

- **Schuif & Auto-Vuur**: Bestuur je squad vloeiend met muis, touch of toetsenbord (`A`/`D` of pijltjestoetsen).
- **Luchtaanval (`Spatie` of tik-knop)**: Laadt op tijdens het spelen en dropt 6 explosieve raketten over de hele breedte van de brug.
- **Rekenpoortjes & Opschiet-poorten**: Kies tussen `+`, `×`, vuursnelheid-, schade-, schild-, drone- en goudkoorts-poortjes, of schiet negatieve rode poortjes omhoog zodat ze positief worden. Er zijn ook mysterie-poortjes. Vanaf Stage 2 schuiven sommige poortjes over de brug.
- **Tonnen, Kratten & TNT**:
  - **TNT-vaten**: Ontploffen in een grote kettingreactie en schakelen omliggende vijanden en tonnen uit.
  - **Wapenkisten**: Live upgrades van Rifle naar Dubbel-SMG, 3-Way Shotgun, Raketwerper en doorborend Plasmakanon.
  - **Schild- & Dronekratten**: Voeg beschermende energieschilden en flankerende aanvalsdrones toe. Drones zijn kwetsbaar: vijandelijk vuur kan ze raken en vernietigen.
  - **Cryo-, Hyper- & Tesla-kratten**: Vertraag alle vijanden, laad je hypervuur op of ontketen een bliksemketting.
  - **Goudkluizen**: Grote goudbeloningen voor wie de tijd neemt om ze open te breken.
- **Barricades**: versperringen op de brug — schiet ze op tijd neer of je squad verliest soldaten.
- **Vijanden**: rushers, raiders, turrets, brutes en bommers, plus sluipschutters met lang bereik en splitters die bij hun dood in twee groepen uiteenvallen.
- **Combo-Streak & Hypervuur**: Snelle eliminaties bouwen je Combo op voor hogere kritieke trefferkans en laden Hypervuur op (`2×` goud en extra vuursnelheid).
- **Afwisselende Biomes & Eindbazen**: Wisselt tussen *Kustbrug*, *Woestijnkloof* en *Nacht-Reactor*, elk afgesloten door een eindbaas (tank, heli, mech of carrier) met een Woede-Fase onder 55% HP.
- **Directe Upgrades**: Besteed goud tussen rondes direct aan **Start-Squad**, **Vuurkracht**, **Vuursnelheid** en **Goudbonus**.

## Balans

- **Lange stages**: standaard 3× lengte (~2 minuten per stage).
- **Rustig tempo**: standaard 90% spelsnelheid.
- **Paarse MAX-poortjes**: standaard 15% frequentie, waarvan 15% dubbel naast elkaar.
- **Vijand-druk**: standaard 130% HP en 115% horde-dichtheid, max. 120 vijanden per golf.
- **Vlakke power-curve**: squad-schade groeit als `squad^0.6`; vijanden schalen zacht mee met je squad.
- **Geleidelijke moeilijkheid**: vijanden worden per stage licht talrijker en taaier, met de grote sprongen pas in hogere stages.
- **Drie voorinstellingen**: *Standaard Arcade* (90% tempo, lange stages), *Snelle Chaos* (140% tempo, 175% HP) en *Oppermacht Sandbox* (plasmakanon, ∞ soldaten, 5 drones).
- **Instelbaar**: tempo, stage-lengte, vijand-HP, horde-dichtheid, leger-limiet, goud-bonus, mini- en eindbazen, start-schild/-drones, startwapen, arena/biome en paarse MAX-poortjes (frequentie, dubbel/enkel, min/max-hoogte).

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

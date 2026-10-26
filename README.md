# Legacy of the Horadrim (LotH)

An **offline**, data-only mod for Diablo II: Resurrected (Reign of the Warlock), built to play on a
Steam Deck with a controller. It reworks the campaign's levelling and items and adds a
Project Diablo 2-style endgame: **Sanctuary Stones** and **the Descent**.

The guide and item database are at [horadrimlegacy.com](https://horadrimlegacy.com).

<!-- alpha -->
**Public alpha.** LotH is playable from Normal to Hell and into the endgame, but expect bugs, crashes and balance
changes between releases. Back up your LotH saves before you update, and tell us what breaks: the crash reporter
and the bug form below are how fixes happen.
<!-- /alpha -->

## Install / update

**Close D2R first.** Then run the installer from the
[latest release](https://github.com/Guitaraholic/legacy-of-the-horadrim/releases/latest):

- **Windows**, in PowerShell:
  `irm https://github.com/Guitaraholic/legacy-of-the-horadrim/releases/latest/download/install.ps1 | iex`
- **Linux or Steam Deck**, in a terminal (Desktop Mode):
  `curl -fsSL https://github.com/Guitaraholic/legacy-of-the-horadrim/releases/latest/download/install.sh | bash`

The installer finds D2R (Battle.net or Steam), checks the package, replaces only `mods/HoradrimLegacy`, and prints the
version it installed. It refuses to run while D2R is open. Saves are kept elsewhere and are never touched. If it
can't find D2R, set `D2R_DIR` to your D2R folder and run it again.

**By hand:** download `HoradrimLegacy-<version>.zip` from the latest release, delete the old `mods/HoradrimLegacy`
folder in your D2R folder (make `mods` if there is none), and unzip the release into `mods`, so you have
`mods/HoradrimLegacy/HoradrimLegacy.mpq`. Close
D2R before you copy: an update under a running game can leave the mod half old, half new. Or clone this repository
and copy its `HoradrimLegacy` folder into `mods`: it is the same mod as the zip.

Launch with `-mod HoradrimLegacy -txt`: in Battle.net, Game Settings → Additional command line arguments; in
Steam, launch options `%command% -mod HoradrimLegacy -txt`. Plug in the controller before launch; D2R switches to its controller UI on its
own.

## Before you update or uninstall

- **Inventory:** LotH widens the inventory to 12×7. **Before updating, empty the bottom row
  (row 8) of every character's inventory.** It no longer exists. Before you uninstall, empty
  columns 11–12 and rows 5–7, or the items in them are lost.
- **Mercenary gear:** mercenaries wear rings, an amulet, a belt, gloves and boots. Before you
  uninstall, take those off every mercenary, or they may be lost.
- **Test-build characters don't carry over.** The test builds are a separate mod with their own save folder:
  this release starts fresh characters (Windows: `Saved Games\Diablo II Resurrected\mods\HoradrimLegacy`).
- **Graphics:** LotH needs the HD graphics. Legacy graphics (the Tab-key classic view) aren't supported.

## Reporting a bug

Open a [bug report](https://github.com/Guitaraholic/legacy-of-the-horadrim/issues/new?template=bug.yml)
with the LotH version, your platform, the difficulty, the area and the steps that led to it.

<!-- alpha -->
**After a crash**, run the crash reporter before you restart the game. It comes with the mod: the installer
puts it in `mods/HoradrimLegacy-crash` and prints its path; a hand unzip leaves it in `mods`.

- **Windows**: right-click `d2r-crash.ps1` → **Run with PowerShell**. The first time, it offers to
  turn crash dumps on for D2R.exe; Windows asks once for permission.
- **Linux / Steam Deck**: in a terminal (Desktop Mode), `bash "<D2R>/mods/HoradrimLegacy-crash/d2r-crash.sh"`. For a fuller
  log, set the Steam launch options to `PROTON_LOG=1 %command% -mod HoradrimLegacy -txt` before you play.

It shows what the report holds and sends it only if you say yes. No account is needed. Reports are private, kept
90 days, and your PC and user names are scrubbed from the text files. If it can't send, it saves
`d2r-crash-<date>.zip` to the Desktop: attach that to a bug report.
<!-- /alpha -->

## Credits

Diablo II: Resurrected, Diablo and Blizzard Entertainment are trademarks or
registered trademarks of Blizzard Entertainment, Inc. The game, its data and its
art are © Blizzard Entertainment, Inc. Legacy of the Horadrim is a free,
non-commercial fan mod. It is not affiliated with, endorsed or sponsored by
Blizzard Entertainment. You need your own copy of Diablo II: Resurrected to
play.

What the mod contains: game tables, strings, maps and icons that we generated
from the game's own data and our own specifications. It contains no Blizzard
executable and no copied game archive. Item art shown on the wiki is Blizzard's,
used here with credit for reference.

Other mods: we thank the Diablo II and Diablo II: Resurrected modding community,
whose open mods advanced the craft and inspired this one. We studied how they
solved problems; we copied no data, maps, art or text from them.

Fonts: the fonts are used under the SIL Open Font License (see OFL.txt).

Our own work: Our data, maps and text are licensed CC BY-NC-SA 4.0; the build
tools are licensed MIT.

Contact and takedown: open an issue at
https://github.com/Guitaraholic/legacy-of-the-horadrim or write through
horadrimlegacy.com. We act on any rights-holder request promptly.

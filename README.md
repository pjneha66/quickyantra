# Quick Yantra

Premiere Pro CEP extension. Search effects, transitions, and commands from a floating panel (`Shift+Space` on macOS).

## Install (macOS)

1. Copy the `QuickYantra` folder to `~/Library/Application Support/Adobe/CEP/extensions/`
2. Enable unsigned CEP extensions for your Premiere install
3. Restart Premiere Pro
4. Open **Window > Extensions > Quick Yantra** once so the launcher starts

After that, `Shift+Space` is handled by the native shell.

## Search

- Type an effect, transition, or command
- Enter applies the highlighted result to the current selection
- Esc closes the search

Search includes the full command catalog (markers, trim/move, rename, anchor, arrange, save, and more), plus Label and Clip keyboard-shortcut commands.

## Ripple Delete

Type `ripple` and press Enter. Selected clips are removed and the gap on each track is closed.

## Tests

```bash
node QuickYantra/test/catalog.test.js

# Quick Yantra

Premiere Pro CEP extension. Search effects, transitions, and commands from a floating panel.

## Install

Copy the `QuickYantra` folder:

- macOS: `~/Library/Application Support/Adobe/CEP/extensions/`
- Windows: `%APPDATA%\Adobe\CEP\extensions\`

Enable unsigned CEP extensions, then restart Premiere Pro. Open **Window > Extensions > Quick Yantra** once so the launcher starts.

## Hotkey

**macOS:** the native shell (`host/FxSearchShell`) registers an OS-level hotkey. Default is `Shift+Space`. The launcher runs `chmod +x` on the shell before spawn (the binary is tracked executable in git).

**Windows:** the native shell (`host/FxSearchShell.exe`) registers the same OS-level hotkey via `RegisterHotKey`. WebView2 (Edge) must be installed.

If you already bound Quick Yantra in **Edit > Keyboard Shortcuts** inside your own custom Premiere preset, the launcher **reads** that `.kys` and copies the same combo into `host/hotkey.txt`. It never writes or overwrites your Premiere keymap.

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
node QuickYantra/test/hotkey.test.js
```

More install notes: `QuickYantra/README.txt`

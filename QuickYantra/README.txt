QUICK YANTRA — Premiere Pro
Extension ID: com.quickyantra.premiere

Reference-equivalent build using the same CEP panel + native macOS floating shell architecture.

GLOBAL SEARCH:
On macOS, Shift + Space opens Quick Yantra from anywhere in Premiere
(native shell hotkey). If you already assigned Quick Yantra in
Edit > Keyboard Shortcuts inside your own custom Premiere preset, the
launcher reads that .kys and uses the same combo. It never writes your
preset files.

On Windows, host/FxSearchShell.exe registers the same OS-level hotkey
(WebView2 / Edge required). If the exe cannot start, bind Quick Yantra in
Edit > Keyboard Shortcuts using your existing custom preset.

Type an effect/transition/command.
Click a result to apply/execute it on the current Premiere selection.
Enter applies the highlighted result.
Esc closes the search.

Search includes the full command catalog (markers, trim/move, rename, anchor,
arrange, save, bins, and more), plus Label and Clip keyboard-shortcut commands.
Those Label/Clip shortcut rows were previously built and then discarded, so they
never appeared in results.

RIPPLE DELETE:
Type "ripple" and press Enter. Selected clips are removed and the gap on each
track is closed.

INSTALL:
macOS: copy QuickYantra to ~/Library/Application Support/Adobe/CEP/extensions/
Windows: copy QuickYantra to %APPDATA%\Adobe\CEP\extensions\

Then restart Premiere Pro.
Open Window > Extensions > Quick Yantra once so Premiere starts the launcher.

On macOS the launcher chmod +x host/FxSearchShell before spawn, then the
native shell registers the hotkey (default Shift+Space, or your Premiere
preset shortcut if one is bound to Quick Yantra).

On Windows the launcher spawns host/FxSearchShell.exe. WebView2 (Edge)
must be installed. The launcher does not autolaunch or hide the CEP panel.

IMPORTANT:
This is an unsigned CEP extension. If Premiere blocks unsigned CEP extensions, enable CEP developer/unsigned-extension loading for your Premiere installation before launching it.

Branding update: replaced the previous FX Search icon with the supplied logo.

BRANDING NOTE
The panel title, on-screen text and logo alt text now read "Quick Yantra" throughout (a
leftover "Social Yantra" title/alt-text from an earlier pass has been corrected).

The logo assets are still named social-yantra-mark-v2.png / social-yantra-logo-v2.png on
purpose — the filenames were deliberately changed from the reference build's icon names so
the macOS WKWebView doesn't reuse a cached old icon. They're internal filenames only and
aren't shown to the user, so they're left as-is; renaming them again isn't necessary and
would just reintroduce the caching problem the unique names solve.

Known internal-only naming leftovers (cosmetic, non-breaking, no user-facing impact):
- The native shell binary (host/FxSearchShell) and its Swift symbol names still say
  "FxSearchShell" — it's a compiled binary from the reference build; renaming it requires
  rebuilding it from source, which isn't part of this package.
- The launcher reads the user's Premiere keyboard presets (Documents/Adobe/
  Premiere Pro/.../*.kys) and copies a Quick Yantra binding into host/hotkey.txt.
  It never writes or overwrites those .kys files.

Delete any older QuickYantra installation before installing this build.

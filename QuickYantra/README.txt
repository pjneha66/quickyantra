QUICK YANTRA — Premiere Pro
Extension ID: com.quickyantra.premiere

Reference-equivalent build using the same CEP panel + native macOS floating shell architecture.

GLOBAL SEARCH:
Shift + Space opens Quick Yantra from anywhere in Premiere.
Type an effect/transition/command.
Click a result to apply/execute it on the current Premiere selection.
Enter applies the highlighted result.
Esc closes the search.

INSTALL (macOS):
Copy the QuickYantra folder to:
~/Library/Application Support/Adobe/CEP/extensions/

Then restart Premiere Pro.
Open Window > Extensions > Quick Yantra once so Premiere starts the launcher.
After that Shift+Space is handled by the native shell.

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
- The optional keyboard-shortcut preset filenames the launcher looks for
  (presets/"FX Search (Mac).kys" / "FX Search (Win).kys") also keep the old name. No such
  presets/ folder or .kys file is actually bundled in this build, so this is a dormant,
  no-op code path today (see launcher/index.html) — nothing to rename until a preset is
  added.

Delete any older QuickYantra installation before installing this build.

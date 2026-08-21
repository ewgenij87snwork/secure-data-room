# Secure Data Room video kit

This isolated Remotion package turns real, sanitized Playwright captures into the README hero.
It is intentionally outside the application workspace so product dependencies remain unchanged.

```bash
cd video
npm ci
npm run typecheck
npm run render
npm run render:gif
```

The package pins every Remotion dependency to the same exact version. Captures and fonts are local,
and the composition is frame-driven: no network requests, `Date`, or randomness during rendering.
The README also includes a shorter browser-evidence cut assembled only from the same real walkthrough
states; the Remotion composition is the polished, repeatable presentation layer.

```markdown
# Design System Document: The Artisanal Ledger

## 1. Overview & Creative North Star: "The Digital Curator"
This design system rejects the "factory-standard" B2B SaaS aesthetic in favor of **The Digital Curator**. Our goal is to blend the raw, tactile heritage of artisanal butchery with the precision of modern enterprise logistics. 

The experience must feel like a high-end editorial magazine—authoritative, spacious, and premium. We break the "template" look through:
*   **Intentional Asymmetry:** Using the 8-point grid to create staggered layouts that guide the eye rhythmically rather than mechanically.
*   **High-Contrast Scale:** Dramatically oversized display typography paired with generous white space to signal luxury.
*   **The "Living" Surface:** Moving away from static flat boxes toward layered, tonal compositions that feel like fine parchment and leather.

---

## 2. Colors & Surface Philosophy
The palette is rooted in the visceral colors of the trade: deep cures, tanned leathers, and bone. 

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders for sectioning or containment. Boundaries must be defined solely through background color shifts. 
*   Use `surface-container-low` for secondary sidebars.
*   Use `surface-container-highest` for active selection states.
*   The transition of color is the boundary.

### Surface Hierarchy & Nesting
Treat the UI as physical layers of material. 
1.  **Base Layer:** `background` (#faf9f4) — The "Bone White" canvas.
2.  **Mid Layer:** `surface-container` (#efeee9) — For grouping related content blocks.
3.  **Top Layer:** `surface-container-lowest` (#ffffff) — Reserved for primary data cards to provide a "pop" of clean light.

### The "Glass & Gradient" Rule
To add "soul," use subtle radial gradients on hero sections transitioning from `primary` (#190000) to `primary-container` (#480003). For floating RTL navigation drawers, apply `backdrop-blur` (12px-20px) to semi-transparent `surface` colors to create a "frosted glass" effect that allows the rich cherry and leather tones to bleed through.

---

## 3. Typography: The Editorial Voice
The implemented system uses a single family — **Plus Jakarta Sans** — across both the React Native app and the Vite portal (with a Hebrew-capable fallback). _(The Newsreader/Inter/Heebo pairing described below is from the original brief and is **not** what shipped; see [`docs/DESIGN_DIRECTION.md`](DESIGN_DIRECTION.md) for the current source of truth.)_

*   **Display & Headlines (Newsreader):** This is our "signature." It conveys heritage and gourmet quality. Use `display-lg` for dashboard welcomes and `headline-sm` for section headers.
*   **Body & UI (Inter/Heebo):** Inter handles Latin characters and numerals with Swiss precision; Heebo ensures the RTL Hebrew script maintains modern readability. 
*   **The Hierarchy:** High contrast is mandatory. A `display-lg` headline should often be followed by a significantly smaller `body-md` description to create "visual air."

---

## 4. Elevation & Depth
In this system, depth is a matter of light and shadow, not lines.

*   **Tonal Layering:** Avoid shadows for standard cards. Achieve lift by placing a `surface-container-lowest` (#ffffff) element atop a `surface-dim` (#dbdad5) background.
*   **Ambient Shadows:** For floating modals or "grabbed" items, use a signature "Leather Shadow":
    *   `color`: `on-secondary-container` (#795546) at 6% opacity.
    *   `blur`: 32px.
    *   `spread`: -4px.
*   **The "Ghost Border" Fallback:** If accessibility requires a stroke (e.g., in high-glare environments), use `outline-variant` (#dcc0bd) at **15% opacity**. Never 100%.

---

## 5. Components

### Buttons
*   **Primary:** `primary-container` (#480003) background with `on-primary` text. No border. `xl` (12px) roundedness.
*   **Secondary:** `secondary-fixed` (#ffdbce) background. Soft, tactile, reminiscent of light leather.
*   **Tertiary:** No background. Bold `primary` text. Focus state uses a `surface-variant` subtle fill.

### Input Fields
*   **Style:** Minimalist underline or soft-fill (`surface-container-high`). Forbid the "all-around" box border.
*   **Focus:** Transition the underline to `primary` (#190000) with a 2px weight.

### Cards & Lists
*   **The Divider Ban:** Do not use horizontal lines between list items. Use 16px or 24px of vertical whitespace (`8-point grid` multiples).
*   **Interactive Lists:** On hover, change the background of the entire row to `surface-container-highest`.

### Platform-Specific Components
*   **The "Grade" Chip:** High-contrast chips for meat grading (e.g., Prime, Choice). Use `primary-fixed` (#ffdad6) with `on-primary-fixed` (#410002) for a "stamped" look.
*   **Weight Scale Slider:** Use `secondary` for the track. _(Note: the implemented `secondary` token is teal `#0d9488` — see `apps/agent-mobile/src/theme/tokens.ts` — not the `#7a5647` leather brown in this stale brief. Actual current values: background `#fafaf9`, primary `#1c1917`, primaryContainer `#7f1d1d`; refer to the token file and [`docs/DESIGN_DIRECTION.md`](DESIGN_DIRECTION.md).)_

---

## 6. Do’s and Don'ts

### Do:
*   **Embrace RTL Asymmetry:** In Hebrew layouts, let the text breathe. Align primary actions to the left (end of line) to create a sophisticated editorial "hang."
*   **Use Large Imagery:** High-resolution photography of artisanal cuts should "bleed" off the edge of containers.
*   **Prioritize 48px Targets:** Even in a dense B2B environment, luxury is never cramped.

### Don't:
*   **Don't use pure black shadows.** It muddies the "Deep Cherry" and "Leather Brown" palette. 
*   **Don't use standard icons.** Use "Light" weight (approx 200-300 weight) icon sets to match the elegance of Inter/Heebo.
*   **Don't fill the screen.** If a table only has 5 rows, don't stretch it to fill the height. Let the `background` bone-white space exist.

---

## 7. Spacing & Grid
*   **Base Unit:** 8px.
*   **Standard Padding:** 24px (3 units) for mobile; 40px (5 units) for desktop containers.
*   **Gutter:** 32px to ensure the "Editorial" feel isn't lost to clutter.```
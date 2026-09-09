# Site assets

All page and component styling uses Tailwind utilities directly in the HTML, including automatic dark mode, responsive layouts, container queries, focus states, and Alpine's `x-cloak` visibility. `src/style.css` contains only the Tailwind import, font faces, and shared font/color tokens. JavaScript uses semantic elements and data attributes rather than styling classes.

Vercel's design guidance informs the visual design; its stylesheet is not a runtime dependency. This is a Frame website by Billy Noyes, not an official Vercel website or an assertion of Vercel affiliation.

## Page layout

The outer container, header, and footer use Tailwind utilities to match [billynoyes.co.uk](https://billynoyes.co.uk/): full width without a maximum, 12px horizontal padding below 768px and 20px above, 16px header padding vertically, and 24px footer padding vertically. Reading prose and the landing snippet retain their own width limits.

## Typography

Font roles and token names match [billynoyes.co.uk](https://billynoyes.co.uk/) and its [theme font definitions](https://github.com/BillyNoyes/billynoyes.co.uk/blob/c7ac57869938842ba50154aa873fb741440c3299/snippets/theme-fonts.liquid):

- `--font-display-family` and `--font-heading-family`: `OffBit`, Inter, sans-serif; headings use weight 700 in Frame, while the wordmark uses weight 400.
- `--font-body-family`: Inter, sans-serif; body text uses weight 400.
- `--font-mono`: `'Geist Mono', 'SF Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`. This is a local-preference stack, not a downloaded webfont.

Fonts in `public/fonts/` retain their source filenames and family names:

- `offbit-trial-regular.woff2` and `offbit-trial-bold.woff2`: copied unchanged from the [source repository assets](https://github.com/BillyNoyes/billynoyes.co.uk/tree/c7ac57869938842ba50154aa873fb741440c3299/assets). The source identifies these as Power Type portfolio trial fonts. They are not covered by Frame's MIT license; confirm the applicable font license before reuse outside the licensed context.
- `inter_n4.b2a3f24c19b4de56e8871f609e73ca7f6d2e2bb9.woff2` and `inter_n7.02711e6b374660cfc7915d1afc1c204e633421e4.woff2`: the regular and bold Inter faces served under `https://billynoyes.co.uk/cdn/fonts/inter/`. Inter's SIL Open Font License is included as `public/fonts/Inter-LICENSE.txt`.

The bold heading and regular body fonts are preloaded; other faces load only when needed. All faces use `font-display: swap`. No Google Fonts, third-party JavaScript, or analytics requests are required.

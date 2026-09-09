# Site assets

`public/assets/vercel-brand.css` is a byte-identical copy of the published foundation at https://vercel.com/geist/vercel-brand.css. It is hosted locally to avoid a third-party stylesheet dependency at runtime and excluded from Prettier. Update it only by replacing the complete upstream file, not by editing its implementation.

SHA-256: `e4f4f41f48947fbb24f4eb49cab37cb077a04af656f746388a9052c1c7f1330e`.

Frame uses the foundation's published CSS API and adapts its design guidance. This is a Frame website by Billy Noyes, not an official Vercel website or an assertion of Vercel affiliation.

## Typography

Font roles and token names match [billynoyes.co.uk](https://billynoyes.co.uk/) and its [theme font definitions](https://github.com/BillyNoyes/billynoyes.co.uk/blob/c7ac57869938842ba50154aa873fb741440c3299/snippets/theme-fonts.liquid):

- `--font-display-family` and `--font-heading-family`: `OffBit`, Inter, sans-serif; headings use weight 400.
- `--font-body-family`: Inter, sans-serif; body text uses weight 400.
- `--font-mono`: `'Geist Mono', 'SF Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`. This is a local-preference stack, not a downloaded webfont.

Fonts in `public/fonts/` retain their source filenames and family names:

- `offbit-trial-regular.woff2` and `offbit-trial-bold.woff2`: copied unchanged from the [source repository assets](https://github.com/BillyNoyes/billynoyes.co.uk/tree/c7ac57869938842ba50154aa873fb741440c3299/assets). The source identifies these as Power Type portfolio trial fonts. They are not covered by Frame's MIT license; confirm the applicable font license before reuse outside the licensed context.
- `inter_n4.b2a3f24c19b4de56e8871f609e73ca7f6d2e2bb9.woff2` and `inter_n7.02711e6b374660cfc7915d1afc1c204e633421e4.woff2`: the regular and bold Inter faces served under `https://billynoyes.co.uk/cdn/fonts/inter/`. Inter's SIL Open Font License is included as `public/fonts/Inter-LICENSE.txt`.

Regular heading and body fonts are preloaded; bold faces load only when needed. All faces use `font-display: swap`. No Google Fonts, third-party JavaScript, or analytics requests are required.

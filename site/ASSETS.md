# Site assets

`public/assets/vercel-brand.css` is a byte-identical copy of the published foundation at https://vercel.com/geist/vercel-brand.css. It is hosted locally to avoid a third-party stylesheet dependency at runtime and excluded from Prettier. Update it only by replacing the complete upstream file, not by editing its implementation.

SHA-256: `e4f4f41f48947fbb24f4eb49cab37cb077a04af656f746388a9052c1c7f1330e`.

Frame uses the foundation's published CSS API and adapts its design guidance. This is a Frame website by Billy Noyes, not an official Vercel website or an assertion of Vercel affiliation.

Geist and Geist Mono are requested from Google Fonts using the foundation guide's font URLs. If those requests are unavailable, the font stacks fall back locally. No third-party JavaScript or analytics is loaded.

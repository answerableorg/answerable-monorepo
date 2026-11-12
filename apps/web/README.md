# Answerable web

The Next.js app serves the public Answerable site and the docs at `/docs`. Answerable ID serves its API and browser pages from `apps/id`.

## Local development

From the repository root, copy `apps/web/.env.example` to `apps/web/.env.local`, then run `bun dev`. The local services use:

| Service | Port |
| --- | ---: |
| Web | 47100 |
| Answerable ID | 47300 |

Set `PORT` to override the web port for a preview. Next.js reads the web environment files from this directory, not the repository root.

To check a production build, run `bun run build`, serve it with `PORT=47101 bun run start`, then run `bun run check:metadata` from this directory (pass another origin as an argument). It checks the canonical, Open Graph and robots tags, structured data, sitemap, icons and OG images.

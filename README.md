# Hylo Website

Welcome to the source for https://hylo-lang.org/!

## Getting Started

This website is built using the static site generator
[Astro](https://astro.build/), with the [Starlight](https://starlight.astro.build/) theme.

Requirements:
- Recent [NodeJS](https://nodejs.org/en/download) 24+.
- pnpm package manager. You can install it via npm:
  ```bash
  npm install -g pnpm
  ```

Then clone this repo, install dependencies, and start the development server:

```bash
pnpm install
pnpm dev
```

Note: hot reloading works well for content and components but not for sidebar changes. If you see something not updating,
just restart the dev server.

**Further tips:** See the `content/docs/docs/contributing/documentation.mdx` for cool mdx features you can use in your docs!

Starlight looks for `.md` or `.mdx` files in the `src/content/docs/` directory. Each file is exposed as a route based on its file name.

Images can be added to `src/assets/` and embedded in Markdown with a relative link.

Static assets, like favicons, can be placed in the `public/` directory.

## Commands

All commands are run from the root of the project, from a terminal:

| Command                   | Action                                           |
| :------------------------ | :----------------------------------------------- |
| `pnpm install`             | Installs dependencies                            |
| `pnpm dev`             | Starts local dev server at `localhost:4321`      |
| `pnpm build`           | Build your production site to `./dist/`          |
| `pnpm preview`         | Preview your build locally, before deploying     |
| `pnpm astro ...`       | Run CLI commands like `astro add`, `astro check` |
| `pnpm astro -- --help` | Get help using the Astro CLI                     |

## Deployment

The site is a fully static build, deployed to **GitHub Pages** by
[`.github/workflows/astro.yml`](.github/workflows/astro.yml) on every push to `main`, and
on new releases of `hylo-new`.

## Playground

Snippets wrapped in `<Playground>` run in the reader's browser, and `/playground/` is a
full-screen playground; see "Runnable snippets" in
`src/content/docs/docs/contributing/documentation.mdx` for how to write them. Both run the Hylo
compiler compiled to WebAssembly, which `scripts/fetch-compiler.ts` puts in
`public/playground/compiler/` from the release the site is built against (its
`hylo-<tag>-wasm32-wasip1.tar.zst`):

```bash
node scripts/write-release-tag.ts
node scripts/fetch-compiler.ts
```

Without it the site still builds, and running a snippet says the compiler is not available. To
try a compiler you built yourself (`Sources/WASM` in hylo-new), point `HYLO_WASM_DIR` at the
release its `js/scripts/package-release.ts` produced. `pnpm test` checks every snippet against
the compiler that was fetched.

## Typos

We use [typos](https://github.com/crate-ci/typos) to check for typos in the documentation.
Add exceptions to the [typos configuration](typos.yml).

## Link checks

We use [lychee](https://github.com/lycheeverse/lychee) to check for broken links throughout the generated website.
Add exceptions to the [lychee configuration](.lycheeignore).

# Hylo Website

Welcome to the source for https://hylo-lang.org/!

## Getting Started

This website is built using the static site generator
[Astro](https://astro.build/), with the [Starlight](https://starlight.astro.build/) theme.

Requirements:
- Recent [NodeJS](https://nodejs.org/en/download).
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

## Typos

We use [typos](https://github.com/crate-ci/typos) to check for typos in the documentation.
Add exceptions to the [typos configuration](typos.yml).

## Link checks

We use [lychee](https://github.com/lycheeverse/lychee) to check for broken links throughout the generated website.
Add exceptions to the [lychee configuration](.lycheeignore).

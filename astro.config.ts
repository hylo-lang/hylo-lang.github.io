// @ts-check
import {defineConfig} from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightThemeRapide from 'starlight-theme-rapide'
import tailwindcss from '@tailwindcss/vite';
import {sidebar} from "./src/content/docs/.sidebar.ts";
import {compilerRepoLink, slackLink} from "./src/links.ts";
import {injectMonacoStyles} from "./src/plugins/inject-monaco-styles.ts";
import {satteri} from '@astrojs/markdown-satteri';
import {playgroundSource} from "./src/plugins/playground-source.ts";
import {stableAssetTimes} from "./src/plugins/stable-asset-times.ts";

// https://astro.build/config
export default defineConfig({
    site: 'https://hylo-lang.org',
    markdown: {
        // Astro's default processor, with a plugin giving every `<Playground>` the code it wraps.
        processor: satteri({mdastPlugins: [playgroundSource]}),
    },
    integrations: [
        starlight({
            title: 'Hylo',
            favicon: 'hylo-favicon.png',
            logo: {
                replacesTitle: true,
                dark: './src/assets/hylo-green-smaller.png',
                light: './src/assets/hylo-black.png',
            },
            social: [
                {icon: 'github', label: 'GitHub', href: compilerRepoLink},
                {
                    icon: 'slack',
                    label: 'Slack',
                    href: slackLink
                },
            ],
            components: {
                'Header': './src/layouts/Header.astro',
                'Hero': './src/components/Hero.astro',
            },

            sidebar: sidebar,
            editLink: {
                baseUrl: 'https://github.com/hylo-lang/hylo-lang.github.io/tree/main/'
            },
            // `global.css` first: it declares the order of the CSS layers, which its first mention fixes.
            customCss: ['./src/styles/global.css', './src/styles/fonts.css'],
            plugins: [starlightThemeRapide()],
        }),
        // Keeps unchanged assets, such as the playground's compiler, cached across deployments.
        stableAssetTimes(),
    ],
    vite: {
        plugins: [tailwindcss(), injectMonacoStyles()],
        // The compiler's loader finds its files next to it, where dependency optimization would
        // not leave it.
        optimizeDeps: {exclude: ['@hylo-lang/hylo-wasm']},
    },
});
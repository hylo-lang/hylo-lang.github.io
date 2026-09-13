// @ts-check
import {defineConfig} from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightThemeRapide from 'starlight-theme-rapide'
import tailwindcss from '@tailwindcss/vite';
import {sidebar} from "./src/content/docs/.sidebar.ts";
import {compilerRepoLink, slackLink} from "./src/links.ts";

// https://astro.build/config
export default defineConfig({
    site: 'https://hylo-lang.org',
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
            },

            sidebar: sidebar,
            editLink: {
                baseUrl: 'https://github.com/hylo-lang/hylo-lang.github.io/tree/main/'
            },
            customCss: ['./src/styles/global.css'],
            plugins: [starlightThemeRapide()],
        }),

    ],
    vite: {
        plugins: [tailwindcss()],
    },
});
// @ts-check
import {defineConfig} from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightThemeRapide from 'starlight-theme-rapide'

import cloudflare from '@astrojs/cloudflare';

import tailwindcss from '@tailwindcss/vite';
import {sidebar} from "./src/content/docs/.sidebar.ts";
import * as fs from "node:fs";
import {pluginErrorPreview} from "./src/components/error-preview-plugin.ts";
import {compilerRepoLink, slackLink} from "./src/links.ts";

// https://astro.build/config
export default defineConfig({
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
                baseUrl: 'https://github.com/hylo-lang/hylo-website/tree/main/'
            },
            customCss: ['./src/styles/global.css'],
            plugins: [starlightThemeRapide()],
            expressiveCode: {
                shiki: {
                    langs: [
                        JSON.parse(fs.readFileSync('./src/assets/syntax/hylo.tmLanguage.json', 'utf-8')),
                        JSON.parse(fs.readFileSync('./src/assets/syntax/ebnf.tmLanguage.json', 'utf-8')),
                    ]
                },
                plugins: [
                    pluginErrorPreview()
                ]
            }
        }),

    ],

    adapter: cloudflare(),
    vite: {
        plugins: [tailwindcss()],
    },
})
;
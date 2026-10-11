/**
 * The site's primary links, in the order shown: in the header (`Header.astro`), whose styles name
 * each by its label in lower case as they move it into the header's menu as the window narrows,
 * and atop the sidebar's menu on narrow pages with a sidebar (`Sidebar.astro`).
 */
export const navLinks = [
    { href: '/blog', label: 'Blog' },
    { href: '/docs/contributing/community/', label: 'Community' },
    { href: '/docs', label: 'Docs' },
    { href: '/playground/', label: 'Playground' },
    { href: '/docs/contributing/research-collab/', label: 'Research' },
    { href: '/docs/contributing', label: 'Contribute' },
] as const;

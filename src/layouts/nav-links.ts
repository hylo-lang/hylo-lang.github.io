/**
 * The site's primary links, in the order shown: in the header (`Header.astro`), and atop the
 * sidebar's menu on narrow pages with a sidebar (`Sidebar.astro`). Each one's `collapse` names it
 * in the header's styles, which move it into the header's menu as the window narrows.
 */
export const navLinks = [
    { href: '/blog', label: 'Blog', collapse: 'blog' },
    { href: '/docs/contributing/community/', label: 'Community', collapse: 'community' },
    { href: '/docs', label: 'Docs', collapse: 'docs' },
    { href: '/playground/', label: 'Playground', collapse: 'playground' },
    { href: '/docs/contributing/research-collab/', label: 'Research', collapse: 'research' },
    { href: '/docs/contributing', label: 'Contribute', collapse: 'contribute' },
] as const;

import {type StarlightUserConfig} from "@astrojs/starlight/types";

type Sidebar = StarlightUserConfig['sidebar'];
type ArrayElement<A> = A extends readonly (infer T)[] ? T : never

const outdatedBadge = {badge: {text: 'outdated', variant: 'caution'}} as const;

export const referencesSidebar: ArrayElement<Sidebar> = {
    label: 'Reference',
    // autogenerate: {directory: 'docs/reference'},
    items: [
        // { label: 'IR', link: 'https://docs.hylo-lang.org/hylo-ir', ...outdatedBadge },
        {label: 'Compiler Architecture', slug: 'docs/reference/compiler-architecture'},
        {label: 'Infrastructure', slug: 'docs/reference/infra'},
        {label: 'Intermediate Representation', slug: 'docs/reference/ir', ...outdatedBadge},
        {label: 'Language Specification', slug: 'docs/reference/specification', ...outdatedBadge},
        {label: 'Standard Library', link: 'https://hylodoc.web.app/Sources/index.html'},
        {label: 'Extracted Compiler Docs', link: 'https://hylo-lang.org/hylo/'},
    ]
};

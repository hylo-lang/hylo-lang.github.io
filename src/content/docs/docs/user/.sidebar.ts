import {type StarlightUserConfig} from "@astrojs/starlight/types";
type Sidebar = StarlightUserConfig['sidebar'];

export const userGuideSidebar = [
    {
        label: 'Language Tour', items: [
            {label: 'Introduction', slug: 'docs/user/language-tour'},
            {label: 'Hello, World!', slug: 'docs/user/language-tour/hello-world'},
            {label: 'Modules', slug: 'docs/user/language-tour/modules'},
            {label: 'Bindings', slug: 'docs/user/language-tour/bindings'},
            {label: 'Basic types', slug: 'docs/user/language-tour/basic-types'},
            {label: 'Functions and methods', slug: 'docs/user/language-tour/functions-and-methods'},
            {label: 'Subscripts', slug: 'docs/user/language-tour/subscripts'},
            {label: 'Concurrency', slug: 'docs/user/language-tour/concurrency'},
            {label: 'Standard Library Docs', link: 'https://hylodoc.web.app/Sources/index.html'},
        ]
    },
    {
        label: 'Tooling', items: [
            {label: 'Editor Extensions', slug: 'docs/user/tooling/editors'},
            {label: 'Documentation Compiler', slug: 'docs/user/tooling/hylodoc'},
            {label: 'Debugger', slug: 'docs/user/tooling/debugger'},
        ]
    }
] as const satisfies Sidebar;
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
            {label: 'Further Reading', link: 'docs/user/language-tour/further-reading'},
        ]
    },
    {
        label: 'Tooling', items: [
            {label: 'Editors', slug: 'docs/user/tooling/editors'},
            {label: 'Documentation Compiler', slug: 'docs/user/tooling/hylodoc'},
            {label: 'Debugging', slug: 'docs/user/tooling/debugger'},
        ]
    }
] as const satisfies Sidebar;
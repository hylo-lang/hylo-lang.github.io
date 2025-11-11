import {type StarlightUserConfig} from "@astrojs/starlight/types";
import {contributingGuideSidebar} from "./docs/contributing/.sidebar.ts";
import {referencesSidebar} from "./docs/reference/.sidebar.ts";
import {userGuideSidebar} from "./docs/user/.sidebar.ts";

type Sidebar = StarlightUserConfig['sidebar'];

export const sidebar = [
    ...userGuideSidebar,
    contributingGuideSidebar,
    referencesSidebar,
] as const satisfies Sidebar;
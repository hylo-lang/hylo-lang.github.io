import {type StarlightUserConfig} from "@astrojs/starlight/types";
import {communitySidebar} from "./docs/contributing/.sidebar.ts";
import {referencesSidebar} from "./docs/reference/.sidebar.ts";
import {userGuideSidebar} from "./docs/user/.sidebar.ts";

type Sidebar = StarlightUserConfig['sidebar'];

export const sidebar = [
    ...userGuideSidebar,
    communitySidebar,
    referencesSidebar,
] as const satisfies Sidebar;
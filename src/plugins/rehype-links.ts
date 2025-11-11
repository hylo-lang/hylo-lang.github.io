import { visit } from "unist-util-visit";
import type { Element } from "hast";

export interface RehypeLinksOptions {
  base?: string;
}

export const rehypeLinks = (options?: RehypeLinksOptions) => {
  let base = options?.base;

  return (ast: any) => {
    if (typeof base !== "string") return;
    if (!base.startsWith("/")) base = "/" + base;
    if (base.length > 1 && base[base.length - 1] === "/")
      base = base.slice(0, -1);

    visit(ast, "element", function (node: Element) {
      if (node.tagName === "a") {
        const href = node.properties?.href;
        if (
          typeof href === "string" &&
          href.startsWith("/") &&
          !href.startsWith(base!)
        ) {
          node.properties!.href = base + href;
        }
      }
    });
  };
};
export type NodeKind = "root" | "class" | "enum" | "leaf";

export interface DiagramNode {
  id: string;
  title: string;
  kind: NodeKind;
  subtitle?: string;
  children?: DiagramNode[];
}

const ACRONYMS = new Map<string, string>([
  ["api", "API"],
  ["er", "ER"],
  ["id", "ID"],
  ["pico", "PICO"],
  ["rct", "RCT"],
  ["url", "URL"],
  ["vr", "VR"],
]);

export function toId(...parts: string[]): string {
  return parts
    .join(".")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

export function humanize(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._]+/g, " ")
    .replace(/[[\]<>~`]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      const lower = token.toLowerCase();
      if (ACRONYMS.has(lower)) {
        return ACRONYMS.get(lower) as string;
      }
      if (token.toUpperCase() === token && token.length <= 5) {
        return token;
      }
      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    })
    .join(" ");
}

export function createRootNode(
  id: string,
  title: string,
  subtitle?: string,
  children?: DiagramNode[],
): DiagramNode {
  return {
    id,
    title,
    kind: "root",
    subtitle,
    children,
  };
}

export function createBranchNode(
  idParts: string[],
  title: string,
  kind: Extract<NodeKind, "class" | "enum">,
  subtitle?: string,
  children?: DiagramNode[],
): DiagramNode {
  return {
    id: toId(...idParts),
    title,
    kind,
    subtitle,
    children,
  };
}

export function createLeafNode(
  idParts: string[],
  title: string,
  subtitle?: string,
): DiagramNode {
  return {
    id: toId(...idParts),
    title,
    kind: "leaf",
    subtitle,
  };
}

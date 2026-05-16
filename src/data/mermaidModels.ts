import {
  createBranchNode,
  createLeafNode,
  createRootNode,
  humanize,
  type DiagramNode,
} from "./diagram";

type MermaidApi = (typeof import("mermaid"))["default"];

export type ModelSource = {
  id: string;
  label: string;
  filename: string;
  raw: string;
};

export type ModelLoadResult =
  | {
      ok: true;
      model: DiagramNode;
    }
  | {
      ok: false;
      error: string;
    };

type ParsedMember = {
  name: string;
  raw: string;
  referencedClassKey?: string;
};

type ParsedClass = {
  key: string;
  rawName: string;
  displayLabel?: string;
  annotation?: string;
  namespace?: string;
  members: ParsedMember[];
  sourceIndex: number;
};

type ParsedRelation = {
  parent: string;
  child: string;
  operator: string;
  signature: string;
  label?: string;
  sourceIndex: number;
};

type ParsedDiagram = {
  classes: Map<string, ParsedClass>;
  structuralRelations: ParsedRelation[];
};

type ClassHeader = {
  key: string;
  rawName: string;
  displayLabel?: string;
  annotation?: string;
};

const rawModelModules = import.meta.glob("../models/*.{mmd,mermaid}", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const modelSources: ModelSource[] = Object.entries(rawModelModules)
  .map(([path, raw]) => {
    const pathParts = path.split("/");
    const filename = pathParts[pathParts.length - 1] ?? path;
    const basename = filename.replace(/\.(mmd|mermaid)$/i, "");
    return {
      id: basename,
      label: humanize(basename),
      filename,
      raw,
    };
  })
  .sort((left, right) => left.filename.localeCompare(right.filename));

const COMMENT_LINE_PATTERN = /^\s*%%.*$/;
const FRONT_MATTER_PATTERN = /^---\s*[\r\n](.*?)[\r\n]---\s*[\r\n]+/s;
const DIRECTIVE_PATTERN = /^%%\{[\s\S]*?}%%\s*$/gm;
const STRUCTURAL_OPERATORS = [
  "<|--",
  "--|>",
  "<|..",
  "..|>",
  "*--",
  "--*",
  "o--",
  "--o",
] as const;
const NON_STRUCTURAL_OPERATORS = ["()--", "--()", "-->", "<--", "..>", "<..", "--", ".."] as const;
const RELATION_OPERATORS = [...STRUCTURAL_OPERATORS, ...NON_STRUCTURAL_OPERATORS];

let mermaidApiPromise: Promise<MermaidApi> | null = null;

export function getModelSources(): ModelSource[] {
  return modelSources;
}

export async function loadModelSource(source: ModelSource): Promise<ModelLoadResult> {
  const mermaidApi = await getMermaidApi();

  const detectedType = detectMermaidType(mermaidApi, source.raw);
  if (!isSupportedClassDiagramType(detectedType)) {
    return {
      ok: false,
      error: `Unsupported Mermaid diagram type "${detectedType}". Class diagrams only.`,
    };
  }

  try {
    const parseResult = await mermaidApi.parse(source.raw);
    if (!isSupportedClassDiagramType(parseResult.diagramType)) {
      return {
        ok: false,
        error: `Unsupported Mermaid diagram type "${parseResult.diagramType}". Class diagrams only.`,
      };
    }
  } catch (error) {
    return {
      ok: false,
      error: formatParseError(error),
    };
  }

  try {
    return {
      ok: true,
      model: buildDiagramTree(source, parseClassDiagram(source.raw)),
    };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "The Mermaid class diagram could not be converted into the viewer tree.",
    };
  }
}

async function getMermaidApi(): Promise<MermaidApi> {
  if (!mermaidApiPromise) {
    mermaidApiPromise = import("mermaid").then((module) => {
      module.default.initialize({
        startOnLoad: false,
      });
      return module.default;
    });
  }

  return mermaidApiPromise;
}

function detectMermaidType(mermaidApi: MermaidApi, raw: string): string {
  try {
    return mermaidApi.detectType(raw);
  } catch {
    const fallback = stripFrontMatterAndDirectives(raw).match(/^\s*(classDiagram(?:-v2)?)/m)?.[1];
    if (fallback) {
      return fallback;
    }
    return "unknown";
  }
}

function isSupportedClassDiagramType(diagramType: string): boolean {
  const normalized = diagramType.trim().toLowerCase();
  return normalized === "class" || normalized === "classdiagram" || normalized === "classdiagram-v2";
}

function formatParseError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return `Unable to parse Mermaid file: ${error.message.trim()}`;
  }

  if (typeof error === "string" && error.trim()) {
    return `Unable to parse Mermaid file: ${error.trim()}`;
  }

  return "Unable to parse Mermaid file because the Mermaid syntax is invalid.";
}

function parseClassDiagram(raw: string): ParsedDiagram {
  const classes = new Map<string, ParsedClass>();
  const structuralRelations: ParsedRelation[] = [];
  const namespaceStack: string[] = [];
  const lines = stripFrontMatterAndDirectives(raw).replace(/\r\n/g, "\n").split("\n");

  let nextClassSourceIndex = 0;
  let activeClassKey: string | null = null;

  const ensureClass = (
    key: string,
    rawName: string,
    displayLabel?: string,
    annotation?: string,
    namespace?: string,
  ): ParsedClass => {
    const existing = classes.get(key);
    if (existing) {
      if (displayLabel) {
        existing.displayLabel = displayLabel;
      }
      if (annotation) {
        existing.annotation = annotation;
      }
      if (namespace) {
        existing.namespace = namespace;
      }
      return existing;
    }

    const parsedClass: ParsedClass = {
      key,
      rawName,
      displayLabel,
      annotation,
      namespace,
      members: [],
      sourceIndex: nextClassSourceIndex,
    };

    nextClassSourceIndex += 1;
    classes.set(key, parsedClass);
    return parsedClass;
  };

  const pushMember = (classKey: string, rawMember: string): void => {
    const targetClass = classes.get(classKey);
    if (!targetClass) {
      return;
    }

    const trimmed = rawMember.trim();
    if (!trimmed || trimmed === "}") {
      return;
    }

    const nestedAnnotation = parseNestedAnnotationLine(trimmed);
    if (nestedAnnotation) {
      targetClass.annotation = nestedAnnotation;
      return;
    }

    targetClass.members.push({
      name: extractMemberName(trimmed),
      raw: trimmed,
      referencedClassKey: extractMemberClassReference(
        trimmed,
        getNamespaceSegmentsForClassKey(classKey),
      ),
    });
  };

  for (const rawLine of lines) {
    const trimmedLine = rawLine.trim();
    if (!trimmedLine || COMMENT_LINE_PATTERN.test(trimmedLine)) {
      continue;
    }

    if (activeClassKey) {
      if (trimmedLine === "}") {
        activeClassKey = null;
        continue;
      }
      pushMember(activeClassKey, trimmedLine);
      continue;
    }

    if (trimmedLine === "}") {
      namespaceStack.pop();
      continue;
    }

    if (isIgnoredStatement(trimmedLine) || isDiagramHeader(trimmedLine)) {
      continue;
    }

    const namespaceMatch = trimmedLine.match(/^namespace\s+(.+?)\s*\{$/);
    if (namespaceMatch) {
      const namespaceName = normalizeIdentifier(namespaceMatch[1]);
      if (namespaceName) {
        namespaceStack.push(namespaceName);
      }
      continue;
    }

    const classBlockMatch = trimmedLine.match(/^class\s+(.+?)\s*\{$/);
    if (classBlockMatch) {
      const header = parseClassHeader(classBlockMatch[1], namespaceStack);
      if (header) {
        const parsedClass = ensureClass(
          header.key,
          header.rawName,
          header.displayLabel,
          header.annotation,
          getNamespaceForClass(header.key),
        );
        activeClassKey = parsedClass.key;
      }
      continue;
    }

    const classDefinitionMatch = trimmedLine.match(/^class\s+(.+)$/);
    if (classDefinitionMatch) {
      const header = parseClassHeader(classDefinitionMatch[1], namespaceStack);
      if (header) {
        ensureClass(
          header.key,
          header.rawName,
          header.displayLabel,
          header.annotation,
          getNamespaceForClass(header.key),
        );
      }
      continue;
    }

    const relation = parseRelation(trimmedLine, namespaceStack);
    if (relation) {
      ensureClass(
        relation.parent,
        basenameFromQualifiedName(relation.parent),
        undefined,
        undefined,
        getNamespaceForClass(relation.parent),
      );
      ensureClass(
        relation.child,
        basenameFromQualifiedName(relation.child),
        undefined,
        undefined,
        getNamespaceForClass(relation.child),
      );

      if (relation.operator.isStructural) {
        structuralRelations.push({
          parent: relation.parent,
          child: relation.child,
          operator: relation.operator.symbol,
          signature: relation.signature,
          label: relation.label,
          sourceIndex: structuralRelations.length,
        });
      }
      continue;
    }

    const annotationLine = parseAnnotationStatement(trimmedLine, namespaceStack);
    if (annotationLine) {
      const annotatedClass = ensureClass(
        annotationLine.key,
        annotationLine.rawName,
        undefined,
        annotationLine.annotation,
        getNamespaceForClass(annotationLine.key),
      );
      annotatedClass.annotation = annotationLine.annotation;
      continue;
    }

    const memberLine = parseClassMemberStatement(trimmedLine, namespaceStack);
    if (memberLine) {
      ensureClass(
        memberLine.classKey,
        basenameFromQualifiedName(memberLine.classKey),
        undefined,
        undefined,
        getNamespaceForClass(memberLine.classKey),
      );
      pushMember(memberLine.classKey, memberLine.memberRaw);
    }
  }

  return {
    classes,
    structuralRelations,
  };
}

function buildDiagramTree(source: ModelSource, parsed: ParsedDiagram): DiagramNode {
  const primaryParentByChild = new Map<string, ParsedRelation>();
  const primaryChildrenByParent = new Map<string, string[]>();
  const extraReferencesByParent = new Map<string, ParsedRelation[]>();
  const structuralRelationsByParent = new Map<string, ParsedRelation[]>();

  for (const relation of parsed.structuralRelations) {
    const relationsForParent = structuralRelationsByParent.get(relation.parent) ?? [];
    relationsForParent.push(relation);
    structuralRelationsByParent.set(relation.parent, relationsForParent);

    if (primaryParentByChild.has(relation.child)) {
      const references = extraReferencesByParent.get(relation.parent) ?? [];
      references.push(relation);
      extraReferencesByParent.set(relation.parent, references);
      continue;
    }

    primaryParentByChild.set(relation.child, relation);
    const childList = primaryChildrenByParent.get(relation.parent) ?? [];
    childList.push(relation.child);
    primaryChildrenByParent.set(relation.parent, childList);
  }

  const sortedClasses = [...parsed.classes.values()].sort(
    (left, right) => left.sourceIndex - right.sourceIndex,
  );
  const builtClasses = new Set<string>();

  const buildClassNode = (classKey: string, ancestorIds: string[], ancestry: Set<string>): DiagramNode => {
    const parsedClass = parsed.classes.get(classKey);
    if (!parsedClass) {
      throw new Error(`Missing Mermaid class definition for "${classKey}".`);
    }

    const nextAncestry = new Set(ancestry);
    nextAncestry.add(classKey);
    builtClasses.add(classKey);

    const nodeIdParts = [...ancestorIds, classKey];
    const children: DiagramNode[] = [];
    const structuralRelations = structuralRelationsByParent.get(classKey) ?? [];

    for (const childKey of primaryChildrenByParent.get(classKey) ?? []) {
      const relation = primaryParentByChild.get(childKey);
      if (!relation) {
        continue;
      }

      const childClass = parsed.classes.get(childKey);
      if (!childClass) {
        continue;
      }

      if (nextAncestry.has(childKey) || builtClasses.has(childKey)) {
        children.push(
          createLeafNode(
            [...nodeIdParts, "reference", childKey, relation.operator],
            `See ${getClassTitle(childClass)}`,
            `Reference via ${relation.signature}`,
          ),
        );
        continue;
      }

      children.push(buildClassNode(childKey, nodeIdParts, nextAncestry));
    }

    for (const relation of extraReferencesByParent.get(classKey) ?? []) {
      const referencedClass = parsed.classes.get(relation.child);
      if (!referencedClass) {
        continue;
      }

      children.push(
        createLeafNode(
          [...nodeIdParts, "reference", relation.child, relation.operator],
          `See ${getClassTitle(referencedClass)}`,
          `Reference via ${relation.signature}`,
        ),
      );
    }

    for (const member of parsedClass.members) {
      const isRepresentedByStructuralChild = structuralRelations.some((relation) => {
        const childClass = parsed.classes.get(relation.child);
        return structuralChildRepresentsMember(member, relation, childClass);
      });

      if (isRepresentedByStructuralChild) {
        continue;
      }

      children.push(
        createLeafNode(
          [...nodeIdParts, member.name],
          humanize(member.name),
          member.raw,
        ),
      );
    }

    return createBranchNode(
      nodeIdParts,
      getClassTitle(parsedClass),
      isEnumeration(parsedClass.annotation) ? "enum" : "class",
      buildClassSubtitle(parsedClass),
      children,
    );
  };

  const rootChildren: DiagramNode[] = [];
  const rootIdParts = [source.id];

  for (const parsedClass of sortedClasses) {
    if (primaryParentByChild.has(parsedClass.key) || builtClasses.has(parsedClass.key)) {
      continue;
    }

    rootChildren.push(buildClassNode(parsedClass.key, rootIdParts, new Set<string>()));
  }

  for (const parsedClass of sortedClasses) {
    if (builtClasses.has(parsedClass.key)) {
      continue;
    }

    rootChildren.push(buildClassNode(parsedClass.key, rootIdParts, new Set<string>()));
  }

  return createRootNode(source.id, source.label, source.filename, rootChildren);
}

function parseClassHeader(rawHeader: string, namespaceStack: string[]): ClassHeader | null {
  let working = rawHeader.trim().replace(/:::[^\s]+$/g, "").trim();
  const annotation = extractAnnotation(working);
  if (annotation) {
    working = working.replace(/<<[^>]+>>/g, "").trim();
  }

  const reference = parseClassReference(working, namespaceStack);
  if (!reference) {
    return null;
  }

  return {
    key: reference.key,
    rawName: reference.rawName,
    displayLabel: reference.displayLabel,
    annotation,
  };
}

function parseClassReference(
  rawReference: string,
  namespaceStack: string[],
): {
  key: string;
  rawName: string;
  displayLabel?: string;
} | null {
  const cleaned = rawReference.replace(/`/g, "").trim();
  if (!cleaned) {
    return null;
  }

  const labelMatch = cleaned.match(/^(.+?)\s*\[(.+)\]$/);
  const rawName = normalizeIdentifier(labelMatch ? labelMatch[1] : cleaned);
  if (!rawName) {
    return null;
  }

  return {
    key: qualifyIdentifier(rawName, namespaceStack),
    rawName,
    displayLabel: labelMatch ? unwrapLabel(labelMatch[2]) : undefined,
  };
}

function parseAnnotationStatement(
  line: string,
  namespaceStack: string[],
): {
  key: string;
  rawName: string;
  annotation: string;
} | null {
  const leadingMatch = line.match(/^<<([^>]+)>>\s+(.+)$/);
  if (leadingMatch) {
    const reference = parseClassReference(leadingMatch[2], namespaceStack);
    if (!reference) {
      return null;
    }
    return {
      key: reference.key,
      rawName: reference.rawName,
      annotation: leadingMatch[1].trim(),
    };
  }

  const trailingMatch = line.match(/^(.+?)\s+<<([^>]+)>>$/);
  if (trailingMatch) {
    const reference = parseClassReference(trailingMatch[1], namespaceStack);
    if (!reference) {
      return null;
    }
    return {
      key: reference.key,
      rawName: reference.rawName,
      annotation: trailingMatch[2].trim(),
    };
  }

  return null;
}

function parseNestedAnnotationLine(line: string): string | null {
  const match = line.match(/^<<([^>]+)>>$/);
  return match ? match[1].trim() : null;
}

function parseClassMemberStatement(
  line: string,
  namespaceStack: string[],
): {
  classKey: string;
  memberRaw: string;
} | null {
  const memberMatch = line.match(/^(.+?)\s*:\s*(.+)$/);
  if (!memberMatch) {
    return null;
  }

  const classReference = parseClassReference(memberMatch[1], namespaceStack);
  if (!classReference) {
    return null;
  }

  return {
    classKey: classReference.key,
    memberRaw: memberMatch[2].trim(),
  };
}

function parseRelation(
  line: string,
  namespaceStack: string[],
): {
  parent: string;
  child: string;
  signature: string;
  label?: string;
  operator: {
    symbol: string;
    isStructural: boolean;
  };
} | null {
  const stripped = stripCardinalitySegments(line).trim();
  for (const symbol of RELATION_OPERATORS) {
    const index = stripped.indexOf(symbol);
    if (index === -1) {
      continue;
    }

    const leftReference = parseClassReference(stripped.slice(0, index), namespaceStack);
    const rightSegment = stripped.slice(index + symbol.length).trim();
    const rightMatch = rightSegment.match(/^(.+?)(?:\s*:\s*(.+))?$/);
    const rightReference = parseClassReference(rightMatch?.[1] ?? rightSegment, namespaceStack);

    if (!leftReference || !rightReference) {
      continue;
    }

    const relation = getStructuralDirection(symbol, leftReference.key, rightReference.key);
    return {
      parent: relation.parent,
      child: relation.child,
      signature: `${leftReference.rawName} ${symbol} ${rightReference.rawName}`,
      label: rightMatch?.[2]?.trim(),
      operator: {
        symbol,
        isStructural: relation.isStructural,
      },
    };
  }

  return null;
}

function getStructuralDirection(
  operator: string,
  leftKey: string,
  rightKey: string,
): {
  parent: string;
  child: string;
  isStructural: boolean;
} {
  switch (operator) {
    case "*--":
    case "o--":
      return {
        parent: leftKey,
        child: rightKey,
        isStructural: true,
      };
    case "--*":
    case "--o":
      return {
        parent: rightKey,
        child: leftKey,
        isStructural: true,
      };
    case "<|--":
    case "<|..":
      return {
        parent: leftKey,
        child: rightKey,
        isStructural: true,
      };
    case "--|>":
    case "..|>":
      return {
        parent: rightKey,
        child: leftKey,
        isStructural: true,
      };
    default:
      return {
        parent: leftKey,
        child: rightKey,
        isStructural: false,
      };
  }
}

function stripFrontMatterAndDirectives(raw: string): string {
  return raw.replace(FRONT_MATTER_PATTERN, "").replace(DIRECTIVE_PATTERN, "");
}

function stripCardinalitySegments(line: string): string {
  return line.replace(/"[^"]*"/g, " ").replace(/\s+/g, " ").trim();
}

function unwrapLabel(rawLabel: string): string {
  return rawLabel.trim().replace(/^["`]|["`]$/g, "").trim();
}

function normalizeIdentifier(rawValue: string): string {
  return rawValue.replace(/`/g, "").trim();
}

function qualifyIdentifier(identifier: string, namespaceStack: string[]): string {
  if (!identifier) {
    return identifier;
  }

  if (identifier.includes(".")) {
    return identifier;
  }

  if (namespaceStack.length === 0) {
    return identifier;
  }

  return `${namespaceStack.join(".")}.${identifier}`;
}

function getNamespaceSegmentsForClassKey(classKey: string): string[] {
  const namespace = getNamespaceForClass(classKey);
  return namespace ? namespace.split(".") : [];
}

function basenameFromQualifiedName(value: string): string {
  const parts = value.split(".");
  return parts[parts.length - 1] ?? value;
}

function getNamespaceForClass(qualifiedName: string): string | undefined {
  const parts = qualifiedName.split(".");
  if (parts.length <= 1) {
    return undefined;
  }
  return parts.slice(0, -1).join(".");
}

function extractAnnotation(rawValue: string): string | undefined {
  const match = rawValue.match(/<<([^>]+)>>/);
  return match ? match[1].trim() : undefined;
}

function extractMemberName(rawMember: string): string {
  const trimmed = rawMember.trim().replace(/[$*]\s*$/g, "");
  const methodMatch = trimmed.match(/([A-Za-z0-9_.-]+)\s*\(/);
  if (methodMatch) {
    return methodMatch[1];
  }

  const colonSections = trimmed.split(":");
  const colonValue = colonSections[0]?.trim();
  if (colonValue) {
    const colonTokens = colonValue.replace(/^[+\-#~]/, "").trim().split(/\s+/);
    const colonName = colonTokens[colonTokens.length - 1];
    if (colonName) {
      return colonName;
    }
  }

  const tokens = trimmed.replace(/^[+\-#~]/, "").trim().split(/\s+/);
  return tokens[tokens.length - 1] ?? trimmed;
}

function extractMemberClassReference(
  rawMember: string,
  namespaceStack: string[],
): string | undefined {
  const trimmed = rawMember.trim();
  if (!trimmed.includes(":") || trimmed.includes("(")) {
    return undefined;
  }

  const typeSection = trimmed
    .slice(trimmed.indexOf(":") + 1)
    .split("=")[0]
    ?.trim();
  if (!typeSection) {
    return undefined;
  }

  const tokens = typeSection.match(/[A-Za-z_][A-Za-z0-9_.]*/g) ?? [];
  for (const token of tokens) {
    const normalized = normalizeIdentifier(token).replace(/\?+$/g, "");
    if (!normalized || isScalarLikeType(normalized)) {
      continue;
    }

    return qualifyIdentifier(normalized, namespaceStack);
  }

  return undefined;
}

function structuralChildRepresentsMember(
  member: ParsedMember,
  relation: ParsedRelation,
  childClass?: ParsedClass,
): boolean {
  if (namesMatch(member.name, relation.label)) {
    return true;
  }

  if (member.referencedClassKey !== undefined) {
    if (namesMatch(member.referencedClassKey, relation.child)) {
      return true;
    }

    if (
      namesMatch(
        basenameFromQualifiedName(member.referencedClassKey),
        basenameFromQualifiedName(relation.child),
      )
    ) {
      return true;
    }
  }

  if (!childClass) {
    return false;
  }

  return (
    namesMatch(member.name, getClassTitle(childClass)) ||
    namesMatch(member.name, childClass.displayLabel) ||
    namesMatch(member.name, basenameFromQualifiedName(childClass.rawName))
  );
}

function namesMatch(left: string | undefined, right: string | undefined): boolean {
  const normalizedLeft = normalizeComparableName(left);
  if (!normalizedLeft) {
    return false;
  }

  return normalizedLeft === normalizeComparableName(right);
}

function normalizeComparableName(value: string | undefined): string {
  return (value ?? "")
    .replace(/~.*$/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function isScalarLikeType(typeName: string): boolean {
  const normalized = typeName.toLowerCase();
  return [
    "any",
    "array",
    "bool",
    "boolean",
    "bytes",
    "dict",
    "double",
    "float",
    "int",
    "integer",
    "list",
    "map",
    "none",
    "null",
    "object",
    "optional",
    "sequence",
    "set",
    "str",
    "string",
    "tuple",
    "union",
    "unknown",
  ].includes(normalized);
}

function getClassTitle(parsedClass: ParsedClass): string {
  return parsedClass.displayLabel ?? humanize(basenameFromQualifiedName(parsedClass.rawName));
}

function buildClassSubtitle(parsedClass: ParsedClass): string {
  const subtitleParts = [parsedClass.rawName];
  if (parsedClass.namespace) {
    subtitleParts.push(`namespace ${parsedClass.namespace}`);
  }
  if (parsedClass.annotation) {
    subtitleParts.push(`<<${parsedClass.annotation}>>`);
  }
  return subtitleParts.join(" • ");
}

function isEnumeration(annotation?: string): boolean {
  return annotation?.toLowerCase() === "enumeration";
}

function isDiagramHeader(line: string): boolean {
  return /^classDiagram(?:-v2)?\b/.test(line);
}

function isIgnoredStatement(line: string): boolean {
  return /^(direction|style|classDef|cssClass|click|link|callback|note|accTitle|accDescr)\b/.test(
    line,
  );
}

import { Edit } from '@openscd/open-scd-core';
import { getReference } from '@openscd/oscd-scl';

export const privType = 'Transpower-SLD-Vertices';
export const sldNs = 'https://transpower.co.nz/SCL/SSD/SLD/v0';
export const xmlnsNs = 'http://www.w3.org/2000/xmlns/';
export const svgNs = 'http://www.w3.org/2000/svg';
export const xlinkNs = 'http://www.w3.org/1999/xlink';

export const eqTypes = [
  'CAB',
  'CAP',
  'CBR',
  'CTR',
  'DIS',
  'GEN',
  'IFL',
  'LIN',
  'MOT',
  'REA',
  'RES',
  'SAR',
  'SMC',
  'VTR',
] as const;
export type EqType = (typeof eqTypes)[number];
export function isEqType(str: string): str is EqType {
  return eqTypes.includes(str as EqType);
}
export const ringedEqTypes = new Set(['GEN', 'MOT', 'SMC']);
export const singleTerminal = new Set([
  'BAT',
  'EFN',
  'FAN',
  'GEN',
  'IFL',
  'MOT',
  'PMP',
  'RRC',
  'SAR',
  'SMC',
  'VTR',
]);

/* eslint-disable no-bitwise */
export function uuid() {
  const digits = new Array(36);
  for (let i = 0; i < 36; i += 1) {
    if ([8, 13, 18, 23].includes(i)) digits[i] = '-';
    else digits[i] = Math.floor(Math.random() * 16);
  }
  digits[14] = 4;
  digits[19] &= ~(1 << 2);
  digits[19] |= 1 << 3;
  return digits.map(x => x.toString(16)).join('');
}
/* eslint-enable no-bitwise */

const transformerKinds = ['default', 'auto', 'earthing'] as const;
export type Point = [number, number];
export type TransformerKind = (typeof transformerKinds)[number];
export type Attrs = {
  pos: Point;
  dim: Point;
  label: Point;
  flip: boolean;
  rot: 0 | 1 | 2 | 3;
  bus: boolean;
  kind: TransformerKind;
};

export function isTransformerKind(
  kind: string | null
): kind is TransformerKind {
  return transformerKinds.includes(kind as TransformerKind);
}

export function xmlBoolean(value?: string | null) {
  return ['true', '1'].includes(value?.trim() ?? 'false');
}

export function isBusBar(element: Element) {
  return (
    element.tagName === 'Bay' &&
    xmlBoolean(element.querySelector('Section[bus]')?.getAttribute('bus'))
  );
}

export function attributes(element: Element): Attrs {
  const [x, y, w, h, rotVal, labelX, labelY] = [
    'x',
    'y',
    'w',
    'h',
    'rot',
    'lx',
    'ly',
  ].map(name => parseFloat(element.getAttributeNS(sldNs, name) ?? '0'));
  const pos = [x, y].map(d => Math.max(0, d)) as Point;
  const dim = [w, h].map(d => Math.max(1, d)) as Point;
  const label = [labelX, labelY].map(d => Math.max(0, d)) as Point;

  const bus = xmlBoolean(element.getAttribute('bus'));
  const flip = xmlBoolean(element.getAttributeNS(sldNs, 'flip'));
  const kindVal = element.getAttributeNS(sldNs, 'kind');
  const kind = isTransformerKind(kindVal) ? kindVal : 'default';

  const rot = (((rotVal % 4) + 4) % 4) as 0 | 1 | 2 | 3;

  return { pos, dim, label, flip, rot, bus, kind };
}

function pathString(...args: string[]) {
  return args.join('/');
}

export function elementPath(element: Element, ...rest: string[]): string {
  const pedigree = [];
  let child = element;
  while (child.parentElement && child.hasAttribute('name')) {
    pedigree.unshift(child.getAttribute('name')!);
    child = child.parentElement;
  }
  return pathString(...pedigree, ...rest);
}

function collinear(v0: Element, v1: Element, v2: Element) {
  const [[x0, y0], [x1, y1], [x2, y2]] = [v0, v1, v2].map(vertex =>
    ['x', 'y'].map(name => vertex.getAttributeNS(sldNs, name))
  );
  return (x0 === x1 && x1 === x2) || (y0 === y1 && y1 === y2);
}

export function removeNode(node: Element): Edit[] {
  const edits = [] as Edit[];

  if (xmlBoolean(node.querySelector(`Section[bus]`)?.getAttribute('bus'))) {
    Array.from(node.querySelectorAll('Section:not([bus])')).forEach(section =>
      edits.push({ node: section })
    );
    const sections = Array.from(node.querySelectorAll('Section[bus]'));
    const busSection = sections[0];
    Array.from(busSection.children)
      .slice(1)
      .forEach(vertex => edits.push({ node: vertex }));
    const lastVertex = sections[sections.length - 1].lastElementChild;
    if (lastVertex)
      edits.push({ parent: busSection, node: lastVertex, reference: null });
    sections.slice(1).forEach(section => edits.push({ node: section }));
  } else edits.push({ node });

  Array.from(
    node.ownerDocument.querySelectorAll(
      `Terminal[connectivityNode="${node.getAttribute(
        'pathName'
      )}"], NeutralPoint[connectivityNode="${node.getAttribute('pathName')}"]`
    )
  ).forEach(terminal => edits.push({ node: terminal }));

  return edits;
}

function reverseSection(section: Element): Edit[] {
  const edits = [] as Edit[];

  Array.from(section.children)
    .reverse()
    .forEach(vertex =>
      edits.push({ parent: section, node: vertex, reference: null })
    );

  return edits;
}

function healSectionCut(cut: Element): Edit[] {
  const [x, y] = ['x', 'y'].map(name => cut.getAttributeNS(sldNs, name));

  const isCut = (vertex: Element) =>
    vertex !== cut &&
    vertex.getAttributeNS(sldNs, 'x') === x &&
    vertex.getAttributeNS(sldNs, 'y') === y;

  const cutVertices = Array.from(
    cut.closest('Private')!.getElementsByTagNameNS(sldNs, 'Section')
  ).flatMap(section => Array.from(section.children).filter(isCut));
  const cutSections = cutVertices.map(v => v.parentElement) as Element[];

  if (cutSections.length > 2) return [];
  if (cutSections.length < 2)
    return removeNode(cut.closest('ConnectivityNode')!);
  const [busA, busB] = cutSections.map(section =>
    xmlBoolean(section.getAttribute('bus'))
  );
  if (busA !== busB) return [];

  const edits = [] as Edit[];
  const [sectionA, sectionB] = cutSections as [Element, Element];
  if (isCut(sectionA.firstElementChild!)) edits.push(reverseSection(sectionA));
  const sectionBChildren = Array.from(sectionB.children);
  if (isCut(sectionB.lastElementChild!)) sectionBChildren.reverse();

  sectionBChildren
    .slice(1)
    .forEach(node => edits.push({ parent: sectionA, node, reference: null }));

  const cutA = Array.from(sectionA.children).find(isCut);
  const neighbourA = isCut(sectionA.firstElementChild!)
    ? sectionA.children[1]
    : sectionA.children[sectionA.childElementCount - 2];
  const neighbourB = sectionBChildren[1];
  if (
    neighbourA &&
    cutA &&
    neighbourB &&
    collinear(neighbourA, cutA, neighbourB)
  )
    edits.push({ node: cutA });
  edits.push({ node: sectionB });

  return edits;
}

function updateTerminals(
  parent: Element,
  cNode: Element,
  substationName: string,
  voltageLevelName: string,
  bayName: string,
  cNodeName: string,
  connectivityNode: string
) {
  const updates = [] as Edit[];

  const oldPathName = cNode.getAttribute('pathName');
  if (!oldPathName) return [];
  const [oldSubstationName, oldVoltageLevelName, oldBayName, oldCNodeName] =
    oldPathName.split('/');

  const terminals = Array.from(
    (cNode.getRootNode() as Document | Element).querySelectorAll(
      `Terminal[substationName="${oldSubstationName}"][voltageLevelName="${oldVoltageLevelName}"][bayName="${oldBayName}"][cNodeName="${oldCNodeName}"], Terminal[connectivityNode="${oldPathName}"], NeutralPoint[substationName="${oldSubstationName}"][voltageLevelName="${oldVoltageLevelName}"][bayName="${oldBayName}"][cNodeName="${oldCNodeName}"], NeutralPoint[connectivityNode="${oldPathName}"]`
    )
  );
  terminals.forEach(terminal => {
    updates.push({
      element: terminal,
      attributes: {
        substationName,
        voltageLevelName,
        bayName,
        connectivityNode,
        cNodeName,
      },
    });
  });
  return updates;
}

function updateConnectivityNodes(
  element: Element,
  parent: Element,
  name: string
) {
  const updates = [] as Edit[];

  const cNodes = Array.from(element.getElementsByTagName('ConnectivityNode'));
  if (element.tagName === 'ConnectivityNode') cNodes.push(element);
  const substationName = parent.closest('Substation')!.getAttribute('name');
  let voltageLevelName = parent.closest('VoltageLevel')?.getAttribute('name');
  if (element.tagName === 'VoltageLevel') voltageLevelName = name;

  cNodes.forEach(cNode => {
    let cNodeName = cNode.getAttribute('name');
    if (element === cNode) cNodeName = name;
    let bayName = cNode.parentElement?.getAttribute('name') ?? '';
    if (element.tagName === 'Bay') bayName = name;
    if (parent.tagName === 'Bay' && parent.hasAttribute('name'))
      bayName = parent.getAttribute('name')!;

    if (cNodeName && bayName) {
      const pathName = `${substationName}/${voltageLevelName}/${bayName}/${cNodeName}`;
      updates.push({
        element: cNode,
        attributes: {
          pathName,
        },
      });
      if (substationName && voltageLevelName && bayName)
        updates.push(
          ...updateTerminals(
            parent,
            cNode,
            substationName,
            voltageLevelName,
            bayName,
            cNodeName,
            pathName
          )
        );
    }
  });
  return updates;
}

export function uniqueName(element: Element, parent: Element): string {
  const children = Array.from(parent.children);
  const oldName = element.getAttribute('name');
  if (
    oldName &&
    !children.find(child => child.getAttribute('name') === oldName)
  )
    return oldName;

  const baseName =
    element.getAttribute('name')?.replace(/[0-9]*$/, '') ??
    element.getAttribute('type') ??
    element.tagName.charAt(0);
  let index = 1;
  function hasName(child: Element) {
    return child.getAttribute('name') === baseName + index.toString();
  }
  while (children.find(hasName)) index += 1;

  return baseName + index.toString();
}

export function reparentElement(element: Element, parent: Element): Edit[] {
  const edits: Edit[] = [];
  edits.push({
    node: element,
    parent,
    reference: getReference(parent, element.tagName),
  });
  const newName = uniqueName(element, parent);
  if (newName !== element.getAttribute('name'))
    edits.push({ element, attributes: { name: newName } });
  edits.push(...updateConnectivityNodes(element, parent, newName));
  return edits;
}

export function removeTerminal(terminal: Element): Edit[] {
  const edits = [] as Edit[];

  edits.push({ node: terminal });
  const pathName = terminal.getAttribute('connectivityNode');
  const cNode = terminal.ownerDocument.querySelector(
    `ConnectivityNode[pathName="${pathName}"]`
  );

  const otherTerminals = Array.from(
    terminal.ownerDocument.querySelectorAll(
      `Terminal[connectivityNode="${pathName}"], NeutralPoint[connectivityNode="${pathName}"]`
    )
  ).filter(t => t !== terminal);

  if (
    cNode &&
    otherTerminals.length > 1 &&
    otherTerminals.some(t => t.closest('Bay')) &&
    otherTerminals.every(t => t.closest('Bay') !== cNode.closest('Bay')) &&
    !isBusBar(cNode.closest('Bay')!)
  ) {
    const newParent = otherTerminals
      .find(t => t.closest('Bay'))!
      .closest('Bay');
    if (newParent) edits.push(...reparentElement(cNode, newParent));
  }
  if (cNode && otherTerminals.length <= 1) {
    edits.push(...removeNode(cNode));
    return edits;
  }

  const priv = cNode?.querySelector(`Private[type="${privType}"]`);
  const vertex = priv?.querySelector(
    `Vertex[*|uuid="${terminal.getAttributeNS(sldNs, 'uuid')}"]`
  );
  const section = vertex?.parentElement;
  if (!section) return edits;
  edits.push({ node: section });

  const cut =
    vertex === section.lastElementChild
      ? section.firstElementChild
      : section.lastElementChild;

  if (cut) edits.push(...healSectionCut(cut));

  return edits;
}

export function connectionStartPoints(equipment: Element): {
  T1: [Point, Point];
  T2: [Point, Point];
} {
  const {
    pos: [x, y],
    rot,
  } = attributes(equipment);

  const T1 = [
    [
      [x + 0.5, y + 0.16],
      [x + 0.84, y + 0.5],
      [x + 0.5, y + 0.84],
      [x + 0.16, y + 0.5],
    ][rot],
    [
      [x + 0.5, y],
      [x + 1, y + 0.5],
      [x + 0.5, y + 1],
      [x, y + 0.5],
    ][rot],
  ] as [Point, Point];
  const T2 = [
    [
      [x + 0.5, y + 0.84],
      [x + 0.16, y + 0.5],
      [x + 0.5, y + 0.16],
      [x + 0.84, y + 0.5],
    ][rot],
    [
      [x + 0.5, y + 1],
      [x, y + 0.5],
      [x + 0.5, y],
      [x + 1, y + 0.5],
    ][rot],
  ] as [Point, Point];

  return { T1, T2 };
}

export type ResizeDetail = {
  w: number;
  h: number;
  element: Element;
};
export type ResizeEvent = CustomEvent<ResizeDetail>;
export function newResizeEvent(detail: ResizeDetail): ResizeEvent {
  return new CustomEvent('oscd-sld-resize', {
    bubbles: true,
    composed: true,
    detail,
  });
}

export type ResizeTLDetail = {
  x: number;
  y: number;
  w: number;
  h: number;
  element: Element;
};
export type ResizeTLEvent = CustomEvent<ResizeTLDetail>;
export function newResizeTLEvent(detail: ResizeTLDetail): ResizeTLEvent {
  return new CustomEvent('oscd-sld-resize-tl', {
    bubbles: true,
    composed: true,
    detail,
  });
}

export type PlaceLabelDetail = {
  x: number;
  y: number;
  element: Element;
};
export type PlaceDetail = {
  x: number;
  y: number;
  element: Element;
  parent: Element;
};
export type PlaceEvent = CustomEvent<PlaceDetail>;
export function newPlaceEvent(detail: PlaceDetail): PlaceEvent {
  return new CustomEvent('oscd-sld-place', {
    bubbles: true,
    composed: true,
    detail,
  });
}

export type PlaceLabelEvent = CustomEvent<PlaceLabelDetail>;
export function newPlaceLabelEvent(detail: PlaceLabelDetail): PlaceLabelEvent {
  return new CustomEvent('oscd-sld-place-label', {
    bubbles: true,
    composed: true,
    detail,
  });
}

export type ConnectDetail = {
  from: Element;
  path: Point[];
  fromTerminal: 'T1' | 'T2' | 'N1' | 'N2';
  to: Element;
  toTerminal?: 'T1' | 'T2' | 'N1' | 'N2';
};
export type ConnectEvent = CustomEvent<ConnectDetail>;
export function newConnectEvent(detail: ConnectDetail): ConnectEvent {
  return new CustomEvent('oscd-sld-connect', {
    bubbles: true,
    composed: true,
    detail,
  });
}
export type StartEvent = CustomEvent<Element>;
export function newRotateEvent(detail: Element): StartEvent {
  return new CustomEvent('oscd-sld-rotate', {
    bubbles: true,
    composed: true,
    detail,
  });
}
export function newStartResizeTLEvent(detail: Element): StartEvent {
  return new CustomEvent('oscd-sld-start-resize-tl', {
    bubbles: true,
    composed: true,
    detail,
  });
}
export function newStartResizeBREvent(detail: Element): StartEvent {
  return new CustomEvent('oscd-sld-start-resize-br', {
    bubbles: true,
    composed: true,
    detail,
  });
}
export function newStartPlaceEvent(detail: Element): StartEvent {
  return new CustomEvent('oscd-sld-start-place', {
    bubbles: true,
    composed: true,
    detail,
  });
}
export function newStartPlaceLabelEvent(detail: Element): StartEvent {
  return new CustomEvent('oscd-sld-start-place-label', {
    bubbles: true,
    composed: true,
    detail,
  });
}
export type StartConnectDetail = {
  from: Element;
  fromTerminal: 'T1' | 'T2' | 'N1' | 'N2';
  path: Point[];
};
export type StartConnectEvent = CustomEvent<StartConnectDetail>;
export function newStartConnectEvent(
  detail: StartConnectDetail
): StartConnectEvent {
  return new CustomEvent('oscd-sld-start-connect', {
    bubbles: true,
    composed: true,
    detail,
  });
}

declare global {
  interface ElementEventMap {
    ['oscd-sld-resize']: ResizeEvent;
    ['oscd-sld-resize-tl']: ResizeTLEvent;
    ['oscd-sld-place']: PlaceEvent;
    ['oscd-sld-place-label']: PlaceLabelEvent;
    ['oscd-sld-connect']: ConnectEvent;
    ['oscd-sld-rotate']: StartEvent;
    ['oscd-sld-start-resize-br']: StartEvent;
    ['oscd-sld-start-resize-tl']: StartEvent;
    ['oscd-sld-start-place']: StartEvent;
    ['oscd-sld-start-place-label']: StartEvent;
    ['oscd-sld-start-connect']: StartConnectEvent;
  }
}

const prettifyXSLT = new DOMParser().parseFromString(
  [
    // describes how we want to modify the XML - indent everything
    '<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform">',
    '  <xsl:strip-space elements="*"/>',
    '  <xsl:template match="para[content-style][not(text())]">',
    '    <xsl:value-of select="normalize-space(.)"/>',
    '  </xsl:template>',
    '  <xsl:template match="node()|@*">',
    '    <xsl:copy><xsl:apply-templates select="node()|@*"/></xsl:copy>',
    '  </xsl:template>',
    '  <xsl:output indent="yes"/>',
    '</xsl:stylesheet>',
  ].join('\n'),
  'application/xml'
);
let xsltProcessor: XSLTProcessor;
if (!navigator.userAgent.toLowerCase().includes('firefox')) {
  xsltProcessor = new XSLTProcessor();
  xsltProcessor.importStylesheet(prettifyXSLT);
}

export function prettyPrint(xmlDoc: XMLDocument | Element): string {
  const doc = xsltProcessor
    ? xsltProcessor.transformToDocument(xmlDoc)
    : xmlDoc;
  return new XMLSerializer().serializeToString(doc);
}

export const robotoDataURL =
  'data:application/font-woff;charset=utf-8;base64,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';

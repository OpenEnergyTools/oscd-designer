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
];
export function isEqType(str) {
    return eqTypes.includes(str);
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
        if ([8, 13, 18, 23].includes(i))
            digits[i] = '-';
        else
            digits[i] = Math.floor(Math.random() * 16);
    }
    digits[14] = 4;
    digits[19] &= ~(1 << 2);
    digits[19] |= 1 << 3;
    return digits.map(x => x.toString(16)).join('');
}
/* eslint-enable no-bitwise */
const transformerKinds = ['default', 'auto', 'earthing'];
export function isTransformerKind(kind) {
    return transformerKinds.includes(kind);
}
export function xmlBoolean(value) {
    var _a;
    return ['true', '1'].includes((_a = value === null || value === void 0 ? void 0 : value.trim()) !== null && _a !== void 0 ? _a : 'false');
}
export function isBusBar(element) {
    var _a;
    return (element.tagName === 'Bay' &&
        xmlBoolean((_a = element.querySelector('Section[bus]')) === null || _a === void 0 ? void 0 : _a.getAttribute('bus')));
}
export function attributes(element) {
    const [x, y, w, h, rotVal, labelX, labelY] = [
        'x',
        'y',
        'w',
        'h',
        'rot',
        'lx',
        'ly',
    ].map(name => { var _a; return parseFloat((_a = element.getAttributeNS(sldNs, name)) !== null && _a !== void 0 ? _a : '0'); });
    const pos = [x, y].map(d => Math.max(0, d));
    const dim = [w, h].map(d => Math.max(1, d));
    const label = [labelX, labelY].map(d => Math.max(0, d));
    const bus = xmlBoolean(element.getAttribute('bus'));
    const flip = xmlBoolean(element.getAttributeNS(sldNs, 'flip'));
    const kindVal = element.getAttributeNS(sldNs, 'kind');
    const kind = isTransformerKind(kindVal) ? kindVal : 'default';
    const rot = (((rotVal % 4) + 4) % 4);
    return { pos, dim, label, flip, rot, bus, kind };
}
function pathString(...args) {
    return args.join('/');
}
export function elementPath(element, ...rest) {
    const pedigree = [];
    let child = element;
    while (child.parentElement && child.hasAttribute('name')) {
        pedigree.unshift(child.getAttribute('name'));
        child = child.parentElement;
    }
    return pathString(...pedigree, ...rest);
}
function collinear(v0, v1, v2) {
    const [[x0, y0], [x1, y1], [x2, y2]] = [v0, v1, v2].map(vertex => ['x', 'y'].map(name => vertex.getAttributeNS(sldNs, name)));
    return (x0 === x1 && x1 === x2) || (y0 === y1 && y1 === y2);
}
export function removeNode(node) {
    var _a;
    const edits = [];
    if (xmlBoolean((_a = node.querySelector(`Section[bus]`)) === null || _a === void 0 ? void 0 : _a.getAttribute('bus'))) {
        Array.from(node.querySelectorAll('Section:not([bus])')).forEach(section => edits.push({ node: section }));
        const sections = Array.from(node.querySelectorAll('Section[bus]'));
        const busSection = sections[0];
        Array.from(busSection.children)
            .slice(1)
            .forEach(vertex => edits.push({ node: vertex }));
        const lastVertex = sections[sections.length - 1].lastElementChild;
        if (lastVertex)
            edits.push({ parent: busSection, node: lastVertex, reference: null });
        sections.slice(1).forEach(section => edits.push({ node: section }));
    }
    else
        edits.push({ node });
    Array.from(node.ownerDocument.querySelectorAll(`Terminal[connectivityNode="${node.getAttribute('pathName')}"], NeutralPoint[connectivityNode="${node.getAttribute('pathName')}"]`)).forEach(terminal => edits.push({ node: terminal }));
    return edits;
}
function reverseSection(section) {
    const edits = [];
    Array.from(section.children)
        .reverse()
        .forEach(vertex => edits.push({ parent: section, node: vertex, reference: null }));
    return edits;
}
function healSectionCut(cut) {
    const [x, y] = ['x', 'y'].map(name => cut.getAttributeNS(sldNs, name));
    const isCut = (vertex) => vertex !== cut &&
        vertex.getAttributeNS(sldNs, 'x') === x &&
        vertex.getAttributeNS(sldNs, 'y') === y;
    const cutVertices = Array.from(cut.closest('Private').getElementsByTagNameNS(sldNs, 'Section')).flatMap(section => Array.from(section.children).filter(isCut));
    const cutSections = cutVertices.map(v => v.parentElement);
    if (cutSections.length > 2)
        return [];
    if (cutSections.length < 2)
        return removeNode(cut.closest('ConnectivityNode'));
    const [busA, busB] = cutSections.map(section => xmlBoolean(section.getAttribute('bus')));
    if (busA !== busB)
        return [];
    const edits = [];
    const [sectionA, sectionB] = cutSections;
    if (isCut(sectionA.firstElementChild))
        edits.push(reverseSection(sectionA));
    const sectionBChildren = Array.from(sectionB.children);
    if (isCut(sectionB.lastElementChild))
        sectionBChildren.reverse();
    sectionBChildren
        .slice(1)
        .forEach(node => edits.push({ parent: sectionA, node, reference: null }));
    const cutA = Array.from(sectionA.children).find(isCut);
    const neighbourA = isCut(sectionA.firstElementChild)
        ? sectionA.children[1]
        : sectionA.children[sectionA.childElementCount - 2];
    const neighbourB = sectionBChildren[1];
    if (neighbourA &&
        cutA &&
        neighbourB &&
        collinear(neighbourA, cutA, neighbourB))
        edits.push({ node: cutA });
    edits.push({ node: sectionB });
    return edits;
}
function updateTerminals(parent, cNode, substationName, voltageLevelName, bayName, cNodeName, connectivityNode) {
    const updates = [];
    const oldPathName = cNode.getAttribute('pathName');
    if (!oldPathName)
        return [];
    const [oldSubstationName, oldVoltageLevelName, oldBayName, oldCNodeName] = oldPathName.split('/');
    const terminals = Array.from(cNode.getRootNode().querySelectorAll(`Terminal[substationName="${oldSubstationName}"][voltageLevelName="${oldVoltageLevelName}"][bayName="${oldBayName}"][cNodeName="${oldCNodeName}"], Terminal[connectivityNode="${oldPathName}"], NeutralPoint[substationName="${oldSubstationName}"][voltageLevelName="${oldVoltageLevelName}"][bayName="${oldBayName}"][cNodeName="${oldCNodeName}"], NeutralPoint[connectivityNode="${oldPathName}"]`));
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
function updateConnectivityNodes(element, parent, name) {
    var _a;
    const updates = [];
    const cNodes = Array.from(element.getElementsByTagName('ConnectivityNode'));
    if (element.tagName === 'ConnectivityNode')
        cNodes.push(element);
    const substationName = parent.closest('Substation').getAttribute('name');
    let voltageLevelName = (_a = parent.closest('VoltageLevel')) === null || _a === void 0 ? void 0 : _a.getAttribute('name');
    if (element.tagName === 'VoltageLevel')
        voltageLevelName = name;
    cNodes.forEach(cNode => {
        var _a, _b;
        let cNodeName = cNode.getAttribute('name');
        if (element === cNode)
            cNodeName = name;
        let bayName = (_b = (_a = cNode.parentElement) === null || _a === void 0 ? void 0 : _a.getAttribute('name')) !== null && _b !== void 0 ? _b : '';
        if (element.tagName === 'Bay')
            bayName = name;
        if (parent.tagName === 'Bay' && parent.hasAttribute('name'))
            bayName = parent.getAttribute('name');
        if (cNodeName && bayName) {
            const pathName = `${substationName}/${voltageLevelName}/${bayName}/${cNodeName}`;
            updates.push({
                element: cNode,
                attributes: {
                    pathName,
                },
            });
            if (substationName && voltageLevelName && bayName)
                updates.push(...updateTerminals(parent, cNode, substationName, voltageLevelName, bayName, cNodeName, pathName));
        }
    });
    return updates;
}
export function uniqueName(element, parent) {
    var _a, _b, _c;
    const children = Array.from(parent.children);
    const oldName = element.getAttribute('name');
    if (oldName &&
        !children.find(child => child.getAttribute('name') === oldName))
        return oldName;
    const baseName = (_c = (_b = (_a = element.getAttribute('name')) === null || _a === void 0 ? void 0 : _a.replace(/[0-9]*$/, '')) !== null && _b !== void 0 ? _b : element.getAttribute('type')) !== null && _c !== void 0 ? _c : element.tagName.charAt(0);
    let index = 1;
    function hasName(child) {
        return child.getAttribute('name') === baseName + index.toString();
    }
    while (children.find(hasName))
        index += 1;
    return baseName + index.toString();
}
export function reparentElement(element, parent) {
    const edits = [];
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
export function removeTerminal(terminal) {
    const edits = [];
    edits.push({ node: terminal });
    const pathName = terminal.getAttribute('connectivityNode');
    const cNode = terminal.ownerDocument.querySelector(`ConnectivityNode[pathName="${pathName}"]`);
    const otherTerminals = Array.from(terminal.ownerDocument.querySelectorAll(`Terminal[connectivityNode="${pathName}"], NeutralPoint[connectivityNode="${pathName}"]`)).filter(t => t !== terminal);
    if (cNode &&
        otherTerminals.length > 1 &&
        otherTerminals.some(t => t.closest('Bay')) &&
        otherTerminals.every(t => t.closest('Bay') !== cNode.closest('Bay')) &&
        !isBusBar(cNode.closest('Bay'))) {
        const newParent = otherTerminals
            .find(t => t.closest('Bay'))
            .closest('Bay');
        if (newParent)
            edits.push(...reparentElement(cNode, newParent));
    }
    if (cNode && otherTerminals.length <= 1) {
        edits.push(...removeNode(cNode));
        return edits;
    }
    const priv = cNode === null || cNode === void 0 ? void 0 : cNode.querySelector(`Private[type="${privType}"]`);
    const vertex = priv === null || priv === void 0 ? void 0 : priv.querySelector(`Vertex[*|uuid="${terminal.getAttributeNS(sldNs, 'uuid')}"]`);
    const section = vertex === null || vertex === void 0 ? void 0 : vertex.parentElement;
    if (!section)
        return edits;
    edits.push({ node: section });
    const cut = vertex === section.lastElementChild
        ? section.firstElementChild
        : section.lastElementChild;
    if (cut)
        edits.push(...healSectionCut(cut));
    return edits;
}
export function connectionStartPoints(equipment) {
    const { pos: [x, y], rot, } = attributes(equipment);
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
    ];
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
    ];
    return { T1, T2 };
}
export function newResizeEvent(detail) {
    return new CustomEvent('oscd-sld-resize', {
        bubbles: true,
        composed: true,
        detail,
    });
}
export function newPlaceEvent(detail) {
    return new CustomEvent('oscd-sld-place', {
        bubbles: true,
        composed: true,
        detail,
    });
}
export function newPlaceLabelEvent(detail) {
    return new CustomEvent('oscd-sld-place-label', {
        bubbles: true,
        composed: true,
        detail,
    });
}
export function newConnectEvent(detail) {
    return new CustomEvent('oscd-sld-connect', {
        bubbles: true,
        composed: true,
        detail,
    });
}
export function newRotateEvent(detail) {
    return new CustomEvent('oscd-sld-rotate', {
        bubbles: true,
        composed: true,
        detail,
    });
}
export function newStartResizeEvent(detail) {
    return new CustomEvent('oscd-sld-start-resize', {
        bubbles: true,
        composed: true,
        detail,
    });
}
export function newStartPlaceEvent(detail) {
    return new CustomEvent('oscd-sld-start-place', {
        bubbles: true,
        composed: true,
        detail,
    });
}
export function newStartPlaceLabelEvent(detail) {
    return new CustomEvent('oscd-sld-start-place-label', {
        bubbles: true,
        composed: true,
        detail,
    });
}
export function newStartConnectEvent(detail) {
    return new CustomEvent('oscd-sld-start-connect', {
        bubbles: true,
        composed: true,
        detail,
    });
}
//# sourceMappingURL=util.js.map
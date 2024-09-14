import { LitElement, html, css, nothing } from 'lit';
import { html as staticHtml, unsafeStatic } from 'lit/static-html.js';
/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
import { property, query, state } from 'lit/decorators.js';

import { Edit, newEditEvent, Update } from '@openscd/open-scd-core';
import { getReference } from '@openscd/oscd-scl';

import type { Dialog } from '@material/mwc-dialog';
import type { IconButtonToggle } from '@material/mwc-icon-button-toggle';
import type { Menu } from '@material/mwc-menu';
import type { List, SingleSelectedEvent } from '@material/mwc-list';
import type { ListItem } from '@material/mwc-list/mwc-list-item.js';

import '@material/mwc-button';
import '@material/mwc-fab';
import '@material/mwc-icon-button';
import '@material/mwc-icon-button-toggle';
import '@material/mwc-icon';
import '@material/mwc-menu';

import './sld-editor.js';

import { bayIcon, equipmentIcon, ptrIcon, voltageLevelIcon } from './icons.js';
import {
  attributes,
  ConnectDetail,
  ConnectEvent,
  elementPath,
  eqTypes,
  isBusBar,
  PlaceEvent,
  PlaceLabelEvent,
  Point,
  privType,
  removeNode,
  removeTerminal,
  reparentElement,
  ResizeEvent,
  ResizeTLEvent,
  sldNs,
  StartConnectDetail,
  StartConnectEvent,
  StartEvent,
  StartPlaceEvent,
  uuid,
  xmlnsNs,
} from './util.js';

const aboutContent = await fetch(new URL('about.html', import.meta.url)).then(
  res => res.text()
);

function makeBusBar(doc: XMLDocument, nsp: string) {
  const busBar = doc.createElementNS(doc.documentElement.namespaceURI, 'Bay');
  busBar.setAttribute('name', 'BB1');
  busBar.setAttributeNS(sldNs, `${nsp}:w`, '2');
  const cNode = doc.createElementNS(
    doc.documentElement.namespaceURI,
    'ConnectivityNode'
  );
  cNode.setAttribute('name', 'L');
  const priv = doc.createElementNS(doc.documentElement.namespaceURI, 'Private');
  priv.setAttribute('type', privType);
  const section = doc.createElementNS(sldNs, `${nsp}:Section`);
  section.setAttribute('bus', 'true');
  const v1 = doc.createElementNS(sldNs, `${nsp}:Vertex`);
  v1.setAttributeNS(sldNs, `${nsp}:x`, '0.5');
  v1.setAttributeNS(sldNs, `${nsp}:y`, '0.5');
  section.appendChild(v1);
  const v2 = doc.createElementNS(sldNs, `${nsp}:Vertex`);
  v2.setAttributeNS(sldNs, `${nsp}:x`, '1.5');
  v2.setAttributeNS(sldNs, `${nsp}:y`, '0.5');
  section.appendChild(v2);
  priv.appendChild(section);
  cNode.appendChild(priv);
  busBar.appendChild(cNode);
  return busBar;
}

function cutSectionAt(
  section: Element,
  index: number,
  [x, y]: Point,
  nsPrefix: string
): Edit[] {
  const parent = section.parentElement!;
  const edits = [] as Edit[];
  const vertices = Array.from(section.getElementsByTagNameNS(sldNs, 'Vertex'));
  const vertexAtXY = vertices.find(
    ve =>
      ve.getAttributeNS(sldNs, 'x') === x.toString() &&
      ve.getAttributeNS(sldNs, 'y') === y.toString()
  );

  if (
    vertexAtXY === vertices[0] ||
    vertexAtXY === vertices[vertices.length - 1]
  )
    return [];

  const newSection = section.cloneNode(true) as Element;
  Array.from(newSection.getElementsByTagNameNS(sldNs, 'Vertex'))
    .slice(0, index + 1)
    .forEach(vertex => vertex.remove());
  const v = vertices[index].cloneNode() as Element;
  v.setAttributeNS(sldNs, `${nsPrefix}:x`, x.toString());
  v.setAttributeNS(sldNs, `${nsPrefix}:y`, y.toString());
  v.removeAttributeNS(sldNs, 'uuid');
  newSection.prepend(v);
  edits.push({
    node: newSection,
    parent,
    reference: section.nextElementSibling,
  });

  vertices.slice(index + 1).forEach(vertex => edits.push({ node: vertex }));

  if (!vertexAtXY) {
    const v2 = v.cloneNode();
    edits.push({ node: v2, parent: section, reference: null });
  }

  return edits;
}

export default class Designer extends LitElement {
  @property()
  doc!: XMLDocument;

  @property()
  get editCount(): number {
    return this._editCount;
  }

  set editCount(value: number) {
    this.connecting = undefined;
    if (!this.resizingBR?.parentElement) this.resizingBR = undefined;
    if (!this.placingLabel?.parentElement) this.placingLabel = undefined;
    this._editCount = value;
  }

  @state()
  private _editCount = -1;

  @state()
  gridSize = 32;

  @state()
  nsp = 'esld';

  @state()
  templateElements: Record<string, Element> = {};

  @state()
  resizingBR?: Element;

  @state()
  resizingTL?: Element;

  @state()
  placing?: Element;

  @state()
  placingOffset: Point = [0, 0];

  @state()
  placingLabel?: Element;

  @state()
  connecting?: {
    from: Element;
    path: Point[];
    fromTerminal: 'T1' | 'T2' | 'N1' | 'N2';
  };

  @state()
  get showLabels(): boolean {
    if (this.labelToggle) return this.labelToggle.on;
    return true;
  }

  @state()
  get showIeds(): boolean {
    if (this.iedToggle) return this.iedToggle.on;
    return true;
  }

  @query('#labels')
  labelToggle?: IconButtonToggle;

  @query('#ieds')
  iedToggle?: IconButtonToggle;

  @query('#about')
  about?: Dialog;

  @query('#iedMenu')
  iedMenu?: Menu;

  zoomIn() {
    this.gridSize += 3;
  }

  zoomOut() {
    this.gridSize -= 3;
    if (this.gridSize < 2) this.gridSize = 2;
  }

  startResizingBottomRight(element: Element | undefined) {
    this.reset();
    this.resizingBR = element;
  }

  startResizingTopLeft(element: Element | undefined) {
    this.reset();
    this.resizingTL = element;
  }

  startPlacing(element: Element | undefined, offset: Point = [0, 0]) {
    this.reset();
    this.placing = element;
    this.placingOffset = offset;
  }

  startPlacingLabel(element: Element | undefined, offset: Point = [0, 0]) {
    this.reset();
    this.placingLabel = element;
    this.placingOffset = offset;
  }

  startConnecting(detail: StartConnectDetail) {
    this.reset();
    this.connecting = detail;
  }

  reset() {
    this.resizingBR = undefined;
    this.resizingTL = undefined;
    this.placing = undefined;
    this.placingLabel = undefined;
    this.connecting = undefined;
  }

  handleKeydown = ({ key }: KeyboardEvent) => {
    if (key === 'Escape') this.reset();
  };

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('keydown', this.handleKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.handleKeydown);
  }

  updated(changedProperties: Map<string, any>) {
    // TODO: Is there a more elegant way to do this?
    if (this.iedMenu)
      this.iedMenu.anchor = this.iedMenu.previousElementSibling as HTMLElement;

    if (!changedProperties.has('doc')) return;
    const sldNsPrefix = this.doc.documentElement.lookupPrefix(sldNs);
    if (sldNsPrefix) {
      this.nsp = sldNsPrefix;
    } else {
      this.doc.documentElement.setAttributeNS(xmlnsNs, 'xmlns:esld', sldNs);
      this.nsp = 'esld';
    }

    [
      'Substation',
      'VoltageLevel',
      'Bay',
      'ConductingEquipment',
      'PowerTransformer',
      'TransformerWinding',
    ].forEach(tag => {
      this.templateElements[tag] = this.doc.createElementNS(
        this.doc.documentElement.namespaceURI,
        tag
      );
    });
    this.templateElements.BusBar = makeBusBar(this.doc, this.nsp);
  }

  rotateElement(element: Element) {
    const { rot } = attributes(element)!;
    const edits = [
      {
        element,
        attributes: {
          [`${this.nsp}:rot`]: {
            namespaceURI: sldNs,
            value: ((rot + 1) % 4).toString(),
          },
        },
      },
    ] as Edit[];
    if (
      element.tagName === 'ConductingEquipment' ||
      element.tagName === 'PowerTransformer'
    ) {
      Array.from(element.querySelectorAll('Terminal, NeutralPoint'))
        .filter(terminal => terminal.getAttribute('cNodeName') !== 'grounded')
        .forEach(terminal => edits.push(...removeTerminal(terminal)));
    }
    this.dispatchEvent(newEditEvent(edits));
  }

  placeLabel(element: Element, x: number, y: number) {
    this.dispatchEvent(
      newEditEvent({
        element,
        attributes: {
          lx: { namespaceURI: sldNs, value: x.toString() },
          ly: { namespaceURI: sldNs, value: y.toString() },
        },
      })
    );
    this.reset();
  }

  placeElement(element: Element, parent: Element, x: number, y: number) {
    const edits: Edit[] = [];
    if (element.parentElement !== parent) {
      edits.push(...reparentElement(element, parent));
    }

    const {
      pos: [oldX, oldY],
      label: [oldLX, oldLY],
      rot,
    } = attributes(element);

    const dx = x - oldX;
    const dy = y - oldY;

    if (element.localName !== 'Vertex') {
      let lx = oldLX;
      let ly = oldLY;
      if (
        element.localName === 'ConductingEquipment' &&
        !element.hasAttributeNS(sldNs, 'lx') &&
        rot % 2 === 0
      ) {
        lx += 1;
        ly += 1;
      }
      if (
        element.localName === 'PowerTransformer' &&
        !element.hasAttributeNS(sldNs, 'lx')
      ) {
        if (rot < 2) lx += 1.5;
        else {
          lx -= 2;
          ly += 2;
        }
      }
      if (
        element.localName === 'IEDName' &&
        !element.hasAttributeNS(sldNs, 'lx')
      ) {
        lx += 1;
        ly += 1;
      }

      edits.push({
        element,
        attributes: {
          x: { namespaceURI: sldNs, value: x.toString() },
          y: { namespaceURI: sldNs, value: y.toString() },
          lx: { namespaceURI: sldNs, value: (lx + dx).toString() },
          ly: { namespaceURI: sldNs, value: (ly + dy).toString() },
        },
      });
    }

    Array.from(element.querySelectorAll('Text')).forEach(text => {
      const {
        label: [textLX, textLY],
      } = attributes(text);
      const newAttributes = {
        lx: {
          namespaceURI: sldNs,
          value: (textLX + dx).toString(),
        },
        ly: {
          namespaceURI: sldNs,
          value: (textLY + dy).toString(),
        },
      };
      edits.push({
        element: text,
        attributes: newAttributes,
      });
    });

    Array.from(
      element.querySelectorAll(
        'Bay, ConductingEquipment, PowerTransformer, Vertex'
      )
    )
      .concat(Array.from(element.getElementsByTagNameNS(sldNs, 'IEDName')))
      .forEach(descendant => {
        const {
          pos: [descX, descY],
          label: [descLX, descLY],
        } = attributes(descendant);
        const newAttributes: Update['attributes'] = {
          x: { namespaceURI: sldNs, value: (descX + dx).toString() },
          y: { namespaceURI: sldNs, value: (descY + dy).toString() },
        };
        if (descendant.localName !== 'Vertex') {
          newAttributes.lx = {
            namespaceURI: sldNs,
            value: (descLX + dx).toString(),
          };
          newAttributes.ly = {
            namespaceURI: sldNs,
            value: (descLY + dy).toString(),
          };
        }
        edits.push({
          element: descendant,
          attributes: newAttributes,
        });
      });

    if (
      element.tagName === 'ConductingEquipment' ||
      element.tagName === 'PowerTransformer'
    ) {
      Array.from(element.querySelectorAll('Terminal, NeutralPoint'))
        .filter(terminal => terminal.getAttribute('cNodeName') !== 'grounded')
        .forEach(terminal => edits.push(...removeTerminal(terminal)));

      const groundedTerminals = Array.from(
        element.querySelectorAll('Terminal, NeutralPoint')
      ).filter(terminal => terminal.getAttribute('cNodeName') === 'grounded');

      if (groundedTerminals.length > 0) {
        const bayName = parent.closest('Bay')?.getAttribute('name');
        if (!bayName)
          groundedTerminals.forEach(terminal =>
            edits.push(...removeTerminal(terminal))
          );

        let newCNode = parent.querySelector(
          `ConnectivityNode[name="grounded"]`
        );

        if (!newCNode) {
          newCNode = this.doc.createElementNS(
            this.doc.documentElement.namespaceURI,
            'ConnectivityNode'
          );
          newCNode.setAttribute('name', 'grounded');
          newCNode.setAttribute('pathName', elementPath(parent, 'grounded'));

          edits.push({
            node: newCNode,
            parent,
            reference: getReference(parent, 'ConnectivityNode'),
          });
        }

        const voltageLevelName = parent
          .closest('VoltageLevel')
          ?.getAttribute('name');
        const substationName = parent
          .closest('Substation')!
          .getAttribute('name')!;
        const connectivityNode = newCNode!.getAttribute('pathName');

        groundedTerminals.forEach(terminal => {
          edits.push({
            element: terminal,
            attributes: {
              connectivityNode,
              bayName,
              voltageLevelName,
              substationName,
            },
          });
        });
      }
    } else if (element.getRootNode() === this.doc) {
      Array.from(element.getElementsByTagName('ConnectivityNode')).forEach(
        cNode => {
          if (
            Array.from(
              this.doc.querySelectorAll(
                `Terminal[connectivityNode="${cNode.getAttribute('pathName')}"],
                 NeutralPoint[connectivityNode="${cNode.getAttribute(
                   'pathName'
                 )}"]`
              )
            ).find(terminal => terminal.closest(element.tagName) !== element)
          )
            edits.push(...removeNode(cNode));
        }
      );
      Array.from(element.querySelectorAll('Terminal, NeutralPoint')).forEach(
        terminal => {
          const cNode = this.doc.querySelector(
            `ConnectivityNode[pathName="${terminal.getAttribute(
              'connectivityNode'
            )}"]`
          );
          if (cNode && cNode.closest(element.tagName) !== element)
            edits.push(...removeNode(cNode));
        }
      );
    }

    if (element.localName === 'Vertex') {
      const bay = element.closest('Bay')!;
      const sections = Array.from(bay.querySelectorAll('Section[bus]'));
      const section = sections[0];
      const vertex = section.querySelector('Vertex')!;
      const lastSection = sections[sections.length - 1];
      const lastVertex = lastSection.querySelector('Vertex:last-of-type')!;
      const {
        pos: [x1, y1],
      } = attributes(vertex);
      const w = x - x1 + 1;
      const h = y - y1 + 1;
      if (isBusBar(bay)) {
        edits.push(...removeNode(section.closest('ConnectivityNode')!));
        edits.push({
          element: lastVertex,
          attributes: {
            x: { namespaceURI: sldNs, value: x.toString() },
            y: { namespaceURI: sldNs, value: y.toString() },
          },
        });
        edits.push({
          element: bay,
          attributes: {
            w: { namespaceURI: sldNs, value: w.toString() },
            h: { namespaceURI: sldNs, value: h.toString() },
          },
        });
      }
    }

    const oldParent = element.parentElement;

    this.dispatchEvent(newEditEvent(edits));

    // wrap IEDName elements within Private element if required
    const enclosingEdits: Edit[] = [];
    if (
      element.localName === 'IEDName' &&
      element.namespaceURI === sldNs &&
      element.parentElement &&
      element.parentElement?.tagName !== 'Private'
    ) {
      let privateElement: Element | null = element.parentElement!.querySelector(
        ':scope > Private[type="OpenSCD-Linked-IEDs"]'
      );

      if (!privateElement) {
        privateElement = this.doc.createElementNS(
          this.doc.documentElement.namespaceURI,
          'Private'
        );
        privateElement.setAttribute('type', 'OpenSCD-Linked-IEDs');
      }

      privateElement.appendChild(element.cloneNode());

      enclosingEdits.push(
        {
          parent: element.parentElement!,
          node: privateElement,
          reference: getReference(element.parentElement!, 'Private'),
        },
        {
          node: element,
        }
      );
    }

    // remove empty Private element if required
    if (
      element.localName === 'IEDName' &&
      oldParent?.tagName === 'Private' &&
      oldParent?.getAttribute('type') === 'OpenSCD-Linked-IEDs' &&
      oldParent.childElementCount === 0
    ) {
      // TODO: In next API release, dispatch with "squash" to support undo/redo more cleanly
      enclosingEdits.push({ node: oldParent });
    }

    if (enclosingEdits.length) this.dispatchEvent(newEditEvent(enclosingEdits));

    if (
      ['Bay', 'VoltageLevel'].includes(element.tagName) &&
      (!element.hasAttributeNS(sldNs, 'w') ||
        !element.hasAttributeNS(sldNs, 'h'))
    )
      this.startResizingBottomRight(element);
    else this.reset();
  }

  connectEquipment({
    from,
    fromTerminal,
    to,
    toTerminal,
    path,
  }: ConnectDetail) {
    if (
      from.tagName === 'TransformerWinding' &&
      to.tagName === 'TransformerWinding'
    )
      return;
    const edits = [] as Edit[];
    let cNode: Element;
    let connectivityNode: string;
    let cNodeName: string;
    let priv: Element;
    if (to.tagName !== 'ConnectivityNode') {
      cNode = this.doc.createElementNS(
        this.doc.documentElement.namespaceURI,
        'ConnectivityNode'
      );
      cNode.setAttribute('name', 'L1');
      const bay = from.closest('Bay') || to.closest('Bay')!;
      edits.push(...reparentElement(cNode, bay));
      connectivityNode = (edits.find(
        e => 'attributes' in e && 'pathName' in e.attributes
      ) as Update | undefined)!.attributes.pathName as string;
      cNodeName =
        ((
          edits.find(e => 'attributes' in e && 'name' in e.attributes) as
            | Update
            | undefined
        )?.attributes.name as string | undefined) ??
        cNode.getAttribute('name')!;
      priv = this.doc.createElementNS(
        this.doc.documentElement.namespaceURI,
        'Private'
      );
      priv.setAttribute('type', privType);
      edits.push({
        parent: cNode,
        node: priv,
        reference: getReference(cNode, 'Private'),
      });
    } else {
      cNode = to;
      connectivityNode = cNode.getAttribute('pathName')!;
      cNodeName = cNode.getAttribute('name')!;
      priv = cNode.querySelector(`Private[type="${privType}"]`)!;
    }
    const section = this.doc.createElementNS(sldNs, `${this.nsp}:Section`);
    edits.push({ parent: priv!, node: section, reference: null });
    const fromTermUUID = uuid();
    const toTermUUID = uuid();
    path.forEach(([x, y], i) => {
      const vertex = this.doc.createElementNS(sldNs, `${this.nsp}:Vertex`);
      vertex.setAttributeNS(sldNs, `${this.nsp}:x`, x.toString());
      vertex.setAttributeNS(sldNs, `${this.nsp}:y`, y.toString());
      if (i === 0)
        vertex.setAttributeNS(sldNs, `${this.nsp}:uuid`, fromTermUUID);
      else if (i === path.length - 1 && to.tagName !== 'ConnectivityNode')
        vertex.setAttributeNS(sldNs, `${this.nsp}:uuid`, toTermUUID);
      edits.push({ parent: section, node: vertex, reference: null });
    });
    if (to.tagName === 'ConnectivityNode') {
      const [x, y] = path[path.length - 1];
      Array.from(priv.getElementsByTagNameNS(sldNs, 'Section')).find(s => {
        const sectionPath = Array.from(
          s.getElementsByTagNameNS(sldNs, 'Vertex')
        ).map(v => attributes(v).pos);
        for (let i = 0; i < sectionPath.length - 1; i += 1) {
          const [x0, y0] = sectionPath[i];
          const [x1, y1] = sectionPath[i + 1];
          if (
            (y0 === y &&
              y === y1 &&
              ((x0 < x && x < x1) || (x1 < x && x < x0))) ||
            (x0 === x &&
              x === x1 &&
              ((y0 < y && y < y1) || (y1 < y && y < y0))) ||
            (y0 === y && x0 === x)
          ) {
            edits.push(cutSectionAt(s, i, [x, y], this.nsp));
            return true;
          }
        }
        return false;
      });
    }
    const [substationName, voltageLevelName, bayName] = connectivityNode.split(
      '/',
      3
    );
    const fromTagName = fromTerminal.startsWith('T')
      ? 'Terminal'
      : 'NeutralPoint';
    const fromTermElement = this.doc.createElementNS(
      this.doc.documentElement.namespaceURI,
      fromTagName
    );
    fromTermElement.setAttributeNS(sldNs, `${this.nsp}:uuid`, fromTermUUID);
    fromTermElement.setAttribute('name', fromTerminal);
    fromTermElement.setAttribute('connectivityNode', connectivityNode);
    fromTermElement.setAttribute('substationName', substationName);
    fromTermElement.setAttribute('voltageLevelName', voltageLevelName);
    fromTermElement.setAttribute('bayName', bayName);
    fromTermElement.setAttribute('cNodeName', cNodeName);
    edits.push({
      node: fromTermElement,
      parent: from,
      reference: getReference(from, fromTagName),
    });
    if (to.tagName === 'ConductingEquipment') {
      const toTagName = toTerminal!.startsWith('T')
        ? 'Terminal'
        : 'NeutralPoint';
      const toTermElement = this.doc.createElementNS(
        this.doc.documentElement.namespaceURI,
        toTagName
      );
      toTermElement.setAttributeNS(sldNs, `${this.nsp}:uuid`, toTermUUID);
      toTermElement.setAttribute('name', toTerminal!);
      toTermElement.setAttribute('connectivityNode', connectivityNode);
      toTermElement.setAttribute('substationName', substationName);
      toTermElement.setAttribute('voltageLevelName', voltageLevelName);
      toTermElement.setAttribute('bayName', bayName);
      toTermElement.setAttribute('cNodeName', cNodeName);
      edits.push({
        node: toTermElement,
        parent: to,
        reference: getReference(to, toTagName),
      });
    }
    this.reset();
    this.dispatchEvent(newEditEvent(edits));
  }

  render() {
    if (!this.doc) return html`<p>Please open an SCL document</p>`;

    const ieds = Array.from(this.doc.querySelectorAll(':root > IED'));

    const linkedIeds = Array.from(
      this.doc.querySelectorAll(':root > Substation')
    ).flatMap(sub => Array.from(sub.getElementsByTagNameNS(sldNs, 'IEDName')));

    const unmatchedLinkedIeds = linkedIeds.filter(
      linkedIed =>
        !ieds.find(
          ied =>
            ied.getAttribute('name') === linkedIed.getAttributeNS(sldNs, 'name')
        )
    ).length;

    return html`<main>
      <nav class="equipment">
        ${
          Array.from(
            this.doc.querySelectorAll(':root > Substation > VoltageLevel > Bay')
          ).find(bay => !isBusBar(bay))
            ? eqTypes
                .map(
                  eqType => html`<mwc-fab
                    mini
                    label="Add ${eqType}"
                    title="Add ${eqType}"
                    @click=${() => {
                      const element =
                        this.templateElements.ConductingEquipment!.cloneNode() as Element;
                      element.setAttribute('type', eqType);
                      this.startPlacing(element);
                    }}
                    >${equipmentIcon(eqType)}</mwc-fab
                  >`
                )
                .concat()
            : nothing
        }${
      this.doc.querySelector(':root > Substation > VoltageLevel')
        ? html`<mwc-fab
              mini
              icon="horizontal_rule"
              @click=${() => {
                const element = this.templateElements.BusBar!.cloneNode(
                  true
                ) as Element;
                this.startPlacing(element);
              }}
              label="Add Bus Bar"
              title="Add Bus Bar"
            >
            </mwc-fab
            ><mwc-fab
              mini
              label="Add Bay"
              title="Add Bay"
              @click=${() => {
                const element =
                  this.templateElements.Bay!.cloneNode() as Element;
                this.startPlacing(element);
              }}
              style="--mdc-theme-secondary: #12579B; --mdc-theme-on-secondary: white;"
            >
              ${bayIcon}
            </mwc-fab>`
        : nothing
    }${
      Array.from(this.doc.documentElement.children).find(
        c => c.tagName === 'Substation'
      )
        ? html`<mwc-fab
              mini
              label="Add VoltageLevel"
              title="Add VoltageLevel"
              @click=${() => {
                const element =
                  this.templateElements.VoltageLevel!.cloneNode() as Element;
                this.startPlacing(element);
              }}
              style="--mdc-theme-secondary: #F5E214;"
            >
              ${voltageLevelIcon}
            </mwc-fab>
            ${ieds.length > 0 || unmatchedLinkedIeds > 0
              ? html`<mwc-fab
                    mini
                    icon="developer_board"
                    label="Add IED"
                    title="Add IED"
                    @click=${() => {
                      if (this.iedToggle) this.iedToggle.on = true;
                      this.iedMenu!.show();
                    }}
                  ></mwc-fab>
                  <mwc-menu
                    fixed
                    corner="BOTTOM_RIGHT"
                    menuCorner="END"
                    id="iedMenu"
                    @selected=${(ev: SingleSelectedEvent) => {
                      const selectedListItem = (ev.target as List)
                        .selected! as ListItem;
                      if (!selectedListItem) return;

                      const name = selectedListItem.dataset.name!;
                      selectedListItem.selected = false;

                      if (name === 'Delete Unmatched') {
                        const edits: Edit[] = [];
                        const editParents: Element[] = [];
                        linkedIeds
                          .filter(
                            linkedIed =>
                              !ieds.find(
                                ied =>
                                  ied.getAttribute('name') ===
                                  linkedIed.getAttributeNS(sldNs, 'name')
                              )
                          )
                          .forEach(unusedLinkedIed => {
                            edits.push({ node: unusedLinkedIed });
                            editParents.push(unusedLinkedIed.parentElement!);
                          });

                        this.dispatchEvent(newEditEvent(edits));

                        // TODO: Without a lot of dispatching not easy to tell if the parent
                        // Private is now empty
                        // In next API release, dispatch with "squash" to support undo/redo more cleanly
                        editParents.forEach(linkedIedParent => {
                          if (
                            linkedIedParent.getElementsByTagNameNS(
                              sldNs,
                              'IEDName'
                            ).length === 0
                          )
                            this.dispatchEvent(
                              newEditEvent({ node: linkedIedParent })
                            );
                        });
                      } else {
                        const element = this.insertOrGetIed(name, this.doc);
                        this.iedMenu!.close();

                        this.startPlacing(element);
                      }
                    }}
                  >
                    ${unmatchedLinkedIeds > 0
                      ? html`<mwc-list-item
                          style="--mdc-theme-text-primary-on-background: #BB1326; --mdc-theme-text-icon-on-background: #BB1326;"
                          graphic="control"
                          hasMeta
                          data-name="Delete Unmatched"
                        >
                          <span
                            >Remove ${unmatchedLinkedIeds} missing
                            IED${unmatchedLinkedIeds > 1 ? 's' : ''} from
                            SLD</span
                          >
                          <mwc-icon slot="graphic">delete</mwc-icon>
                        </mwc-list-item>`
                      : nothing}
                    ${Array.from(ieds)
                      .sort((a, b) => {
                        const aName = a.getAttribute('name')!;
                        const bName = b.getAttribute('name')!;

                        const aPlaced = linkedIeds.find(
                          ied =>
                            ied.getAttributeNS(sldNs, 'name') === aName &&
                            ied.hasAttributeNS(sldNs, 'x')
                        )
                          ? 'A'
                          : 'B';
                        const bPlaced = linkedIeds.find(
                          ied =>
                            ied.getAttributeNS(sldNs, 'name') === bName &&
                            ied.hasAttributeNS(sldNs, 'x')
                        )
                          ? 'A'
                          : 'B';

                        return `${bPlaced} ${bName.toLowerCase()}`.localeCompare(
                          `${aPlaced} ${aName.toLowerCase()}`
                        );
                      })
                      .map(ied => {
                        const linkedIed = linkedIeds.find(
                          lIed =>
                            lIed.getAttributeNS(sldNs, 'name') ===
                              ied.getAttribute('name') &&
                            lIed.hasAttributeNS(sldNs, 'x')
                        );

                        return html`<mwc-list-item
                          twoline
                          graphic="control"
                          ?hasMeta=${!!linkedIeds.find(
                            placedIed =>
                              ied.getAttribute('name') ===
                                placedIed.getAttributeNS(sldNs, 'name') &&
                              placedIed.hasAttributeNS(sldNs, 'x')
                          )}
                          data-name="${ied.getAttribute('name')!}"
                        >
                          <span>${ied.getAttribute('name')!}</span>
                          <span slot="secondary"
                            >${[
                              ied.getAttribute('manufacturer'),
                              ied.getAttribute('type'),
                              ied.getAttribute('desc'),
                            ]
                              .filter(a => !!a)
                              .join(' - ')}
                          </span>
                          ${linkedIed
                            ? html`<mwc-icon slot="meta">pin_drop</mwc-icon>`
                            : nothing}
                          <mwc-icon slot="graphic">developer_board</mwc-icon>
                        </mwc-list-item>`;
                      })}
                  </mwc-menu>`
              : nothing}`
        : nothing
    }<mwc-fab
          mini
          icon="margin"
          @click=${() => this.insertSubstation()}
          label="Add Substation"
          style="--mdc-theme-secondary: #BB1326; --mdc-theme-on-secondary: white;"
          title="Add Substation"
        >
        </mwc-fab
        >${
          Array.from(this.doc.documentElement.children).find(
            c => c.tagName === 'Substation'
          )
            ? html`<mwc-fab
                  mini
                  label="Add Single Winding Auto Transformer"
                  title="Add Single Winding Auto Transformer"
                  @click=${() => {
                    const element =
                      this.templateElements.PowerTransformer!.cloneNode() as Element;
                    element.setAttribute('type', 'PTR');
                    element.setAttributeNS(sldNs, `${this.nsp}:kind`, 'auto');
                    element.setAttributeNS(sldNs, `${this.nsp}:rot`, '3');
                    const winding =
                      this.templateElements.TransformerWinding!.cloneNode() as Element;
                    winding.setAttribute('type', 'PTW');
                    winding.setAttribute('name', 'W1');
                    element.appendChild(winding);
                    this.startPlacing(element);
                  }}
                  >${ptrIcon(1, { kind: 'auto' })}</mwc-fab
                ><mwc-fab
                  mini
                  label="Add Two Winding Auto Transformer"
                  title="Add Two Winding Auto Transformer"
                  @click=${() => {
                    const element =
                      this.templateElements.PowerTransformer!.cloneNode() as Element;
                    element.setAttribute('type', 'PTR');
                    element.setAttributeNS(sldNs, `${this.nsp}:kind`, 'auto');
                    const windings = [];
                    for (let i = 1; i <= 2; i += 1) {
                      const winding =
                        this.templateElements.TransformerWinding!.cloneNode() as Element;
                      winding.setAttribute('type', 'PTW');
                      winding.setAttribute('name', `W${i}`);
                      windings.push(winding);
                    }
                    element.append(...windings);
                    this.startPlacing(element);
                  }}
                  >${ptrIcon(2, { kind: 'auto' })}</mwc-fab
                ><mwc-fab
                  mini
                  label="Add Two Winding Transformer"
                  title="Add Two Winding Transformer"
                  @click=${() => {
                    const element =
                      this.templateElements.PowerTransformer!.cloneNode() as Element;
                    element.setAttribute('type', 'PTR');
                    const windings = [];
                    for (let i = 1; i <= 2; i += 1) {
                      const winding =
                        this.templateElements.TransformerWinding!.cloneNode() as Element;
                      winding.setAttribute('type', 'PTW');
                      winding.setAttribute('name', `W${i}`);
                      windings.push(winding);
                    }
                    element.append(...windings);
                    this.startPlacing(element);
                  }}
                  >${ptrIcon(2)}</mwc-fab
                ><mwc-fab
                  mini
                  label="Add Three Winding Transformer"
                  title="Add Three Winding Transformer"
                  @click=${() => {
                    const element =
                      this.templateElements.PowerTransformer!.cloneNode() as Element;
                    element.setAttribute('type', 'PTR');
                    const windings = [];
                    for (let i = 1; i <= 3; i += 1) {
                      const winding =
                        this.templateElements.TransformerWinding!.cloneNode() as Element;
                      winding.setAttribute('type', 'PTW');
                      winding.setAttribute('name', `W${i}`);
                      windings.push(winding);
                    }
                    element.append(...windings);
                    this.startPlacing(element);
                  }}
                  >${ptrIcon(3)}</mwc-fab
                ><mwc-fab
                  mini
                  label="Add Single Winding Earthing Transformer"
                  title="Add Single Winding Earthing Transformer"
                  @click=${() => {
                    const element =
                      this.templateElements.PowerTransformer!.cloneNode() as Element;
                    element.setAttribute('type', 'PTR');
                    element.setAttributeNS(
                      sldNs,
                      `${this.nsp}:kind`,
                      'earthing'
                    );
                    const winding =
                      this.templateElements.TransformerWinding!.cloneNode() as Element;
                    winding.setAttribute('type', 'PTW');
                    winding.setAttribute('name', 'W1');
                    element.appendChild(winding);
                    this.startPlacing(element);
                  }}
                  >${ptrIcon(1, { kind: 'earthing' })}</mwc-fab
                ><mwc-fab
                  mini
                  label="Add Two Winding Earthing Transformer"
                  title="Add Two Winding Earthing Transformer"
                  @click=${() => {
                    const element =
                      this.templateElements.PowerTransformer!.cloneNode() as Element;
                    element.setAttribute('type', 'PTR');
                    element.setAttributeNS(
                      sldNs,
                      `${this.nsp}:kind`,
                      'earthing'
                    );
                    const windings = [];
                    for (let i = 1; i <= 2; i += 1) {
                      const winding =
                        this.templateElements.TransformerWinding!.cloneNode() as Element;
                      winding.setAttribute('type', 'PTW');
                      winding.setAttribute('name', `W${i}`);
                      windings.push(winding);
                    }
                    element.append(...windings);
                    this.startPlacing(element);
                  }}
                  >${ptrIcon(2, { kind: 'earthing' })}</mwc-fab
                >`
            : nothing
        }
        ${
          this.doc.querySelector('VoltageLevel, PowerTransformer')
            ? html`<mwc-icon-button-toggle
                id="labels"
                label="Toggle Labels"
                title="Toggle Labels"
                on
                onIcon="font_download"
                offIcon="font_download_off"
                @click=${() => this.requestUpdate()}
              ></mwc-icon-button-toggle>`
            : nothing
        }
        ${
          (ieds.length > 0 || unmatchedLinkedIeds > 0) &&
          this.doc.querySelector(':root > Substation')
            ? html`<mwc-icon-button-toggle
                id="ieds"
                label="Toggle IEDs"
                title="Toggle IEDs"
                on
                onIcon="developer_board"
                offIcon="developer_board_off"
                @click=${() => {
                  if (this.iedMenu) this.requestUpdate();
                }}
              ></mwc-icon-button-toggle>`
            : nothing
        }
        ${
          this.doc.querySelector('Substation')
            ? html`<mwc-icon-button
                  icon="zoom_in"
                  label="Zoom In"
                  title="Zoom In (${Math.round(
                    (100 * (this.gridSize + 3)) / 32
                  )}%)"
                  @click=${() => this.zoomIn()}
                >
                </mwc-icon-button
                ><mwc-icon-button
                  icon="zoom_out"
                  label="Zoom Out"
                  ?disabled=${this.gridSize < 4}
                  title="Zoom Out (${Math.round(
                    (100 * (this.gridSize - 3)) / 32
                  )}%)"
                  @click=${() => this.zoomOut()}
                ></mwc-icon-button>`
            : nothing
        }
        </mwc-icon-button
        >${
          this.placing ||
          this.resizingBR ||
          this.resizingTL ||
          this.connecting ||
          this.placingLabel
            ? html`<mwc-icon-button
                icon="close"
                label="Cancel"
                title="Cancel"
                @click=${() => this.reset()}
              ></mwc-icon-button>`
            : html`<mwc-icon-button
                icon="info"
                label="About"
                title="About"
                @click=${() => this.about?.show()}
              ></mwc-icon-button>`
        }
      </nav>
      ${Array.from(this.doc.querySelectorAll(':root > Substation')).map(
        subs =>
          html`<sld-editor
            .doc=${this.doc}
            .editCount=${this.editCount}
            .substation=${subs}
            .gridSize=${this.gridSize}
            .resizingBR=${this.resizingBR}
            .resizingTL=${this.resizingTL}
            .placing=${this.placing}
            .placingOffset=${this.placingOffset}
            .placingLabel=${this.placingLabel}
            .connecting=${this.connecting}
            .showLabels=${this.showLabels}
            .showIeds=${this.showIeds}
            @oscd-sld-start-resize-br=${({ detail }: StartEvent) => {
              this.startResizingBottomRight(detail);
            }}
            @oscd-sld-start-resize-tl=${({ detail }: StartEvent) => {
              this.startResizingTopLeft(detail);
            }}
            @oscd-sld-start-place=${({
              detail: { element, offset },
            }: StartPlaceEvent) => {
              this.startPlacing(element, offset);
            }}
            @oscd-sld-start-place-label=${({
              detail: { element, offset },
            }: StartPlaceEvent) => {
              this.startPlacingLabel(element, offset);
            }}
            @oscd-sld-start-connect=${({ detail }: StartConnectEvent) => {
              this.startConnecting(detail);
            }}
            @oscd-sld-resize=${({ detail: { element, w, h } }: ResizeEvent) => {
              this.dispatchEvent(
                newEditEvent({
                  element,
                  attributes: {
                    w: { namespaceURI: sldNs, value: w.toString() },
                    h: { namespaceURI: sldNs, value: h.toString() },
                  },
                })
              );
              this.reset();
            }}
            @oscd-sld-resize-tl=${({
              detail: { element, x, y, w, h },
            }: ResizeTLEvent) => {
              const {
                pos: [oldX, oldY],
                label: [oldLX, oldLY],
              } = attributes(element);
              let lx = oldLX;
              let ly = oldLY;
              if (lx === oldX && ly === oldY) {
                lx += x - oldX;
                ly += y - oldY;
              }
              this.dispatchEvent(
                newEditEvent({
                  element,
                  attributes: {
                    x: { namespaceURI: sldNs, value: x.toString() },
                    y: { namespaceURI: sldNs, value: y.toString() },
                    w: { namespaceURI: sldNs, value: w.toString() },
                    h: { namespaceURI: sldNs, value: h.toString() },
                    lx: { namespaceURI: sldNs, value: lx.toString() },
                    ly: { namespaceURI: sldNs, value: ly.toString() },
                  },
                })
              );
              this.reset();
            }}
            @oscd-sld-place=${({
              detail: { element, parent, x, y },
            }: PlaceEvent) => {
              this.placeElement(element, parent, x, y);
            }}
            @oscd-sld-place-label=${({
              detail: { element, x, y },
            }: PlaceLabelEvent) => this.placeLabel(element, x, y)}
            @oscd-sld-connect=${({ detail }: ConnectEvent) =>
              this.connectEquipment(detail)}
            @oscd-sld-rotate=${({ detail }: StartEvent) =>
              this.rotateElement(detail)}
          ></sld-editor>`
      )}
    </main>
    ${staticHtml`<mwc-dialog id="about" heading="About">
        <div>${unsafeStatic(aboutContent)}</div>
        <mwc-button dialogAction="close" slot="primaryAction">
          close
        </mwc-button>
      </mwc-dialog>`}`;
  }

  insertOrGetIed(name: string, doc: XMLDocument): Element {
    const linkedIed = Array.from(
      doc.getElementsByTagNameNS(sldNs, 'IEDName') ?? []
    ).find(lIed => lIed.getAttributeNS(sldNs, 'name') === name);

    if (linkedIed) return linkedIed;

    const newLinkedIed = doc.createElementNS(sldNs, `${this.nsp}:IEDName`);
    newLinkedIed.setAttributeNS(sldNs, `${this.nsp}:name`, name);

    return newLinkedIed;
  }

  insertSubstation() {
    const parent = this.doc.documentElement;
    const node = this.doc.createElementNS(
      this.doc.documentElement.namespaceURI,
      'Substation'
    );
    const reference = getReference(parent, 'Substation');
    let index = 1;
    while (this.doc.querySelector(`:root > Substation[name="S${index}"]`))
      index += 1;
    node.setAttribute('name', `S${index}`);
    node.setAttributeNS(sldNs, `${this.nsp}:w`, '50');
    node.setAttributeNS(sldNs, `${this.nsp}:h`, '25');
    this.dispatchEvent(newEditEvent({ parent, node, reference }));
  }

  static styles = css`
    main {
      padding: 16px;
      width: fit-content;
      position: relative;
    }

    div {
      margin-top: 12px;
    }

    nav.equipment {
      user-select: none;
      position: sticky;
      top: 68px;
      left: 16px;
      width: fit-content;
      max-width: calc(100vw - 32px);
      background: #fffd;
      border-radius: 24px;
      z-index: 1;
    }

    mwc-icon-button,
    mwc-icon-button-toggle {
      --mdc-theme-text-disabled-on-light: #aaa;
      color: rgb(0, 0, 0 / 0.83);
    }
    mwc-fab {
      --mdc-theme-secondary: #fff;
      --mdc-theme-on-secondary: rgb(0, 0, 0 / 0.83);
    }
  `;
}

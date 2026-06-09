figma.showUI(__html__, { width: 760, height: 860, themeColors: true });

function broadcastSelection() {
  const sel = figma.currentPage.selection;
  figma.ui.postMessage({
    type: 'selection-changed',
    count: sel.length,
    names: sel.slice(0, 3).map(n => n.name)
  });
}

figma.on('selectionchange', broadcastSelection);
broadcastSelection();

const GENERIC_NAMES = new Set([
  'frame', 'group', 'rectangle', 'vector', 'image', 'text', 'component', 'instance', 'line', 'polygon', 'ellipse', 'star', 'shape', 'copy'
]);
const ISSUE_TO_STAT = {
  'hidden-layer': 'hiddenLayers',
  'generic-name': 'genericNames',
  'deep-nesting': 'deepNesting',
  'missing-text-style': 'missingTextStyles',
  'missing-color-style': 'missingColorStyles',
  'button-no-auto-layout': 'buttonsWithoutAutoLayout',
  'fixed-height-section': 'fixedSectionHeights',
  'flatten-vectors': 'vectorsToFlatten',
  'strokes-found': 'strokesFound',
  'line-object': 'lineObjects',
  'mask-found': 'masksFound',
  'missing-export': 'missingExportSettings',
  'section-no-auto-layout': 'sectionsWithoutAutoLayout',
  'background-layer': 'backgroundWrappers',
  'empty-group': 'emptyGroups',
  // v17 new checks
  'text-overflow': 'textOverflow',
  'auto-line-height': 'autoLineHeight',
  'near-dupe-spacing': 'nearDupSpacing',
  'section-overlap': 'sectionOverlaps',
  'missing-font': 'missingFonts',
  'no-mobile-frame': 'noMobileFrame',
  'interactive-no-states': 'interactivePatterns',
  'multiple-fonts': 'multipleFonts'
};

// Static lookup: why each issue matters and how to fix it.
// Shown in the UI as an expandable "Why & how to fix" panel per issue card.
const ISSUE_DETAILS = {
  'hidden-layer': {
    why: 'Hidden layers are invisible in the final product but bloat the Figma file and confuse developers inspecting the design. They also export in some formats and slow down plugin processing.',
    steps: ['Open the Layers panel (left sidebar).', 'Look for layers with a strikethrough eye icon.', 'Delete layers you no longer need, or move draft content to a separate "Scratch" page outside the handoff frame.', 'Use the automated "Remove hidden layers" button in this plugin to clear them in bulk.']
  },
  'generic-name': {
    why: 'Layer names become CSS class names, ACF field keys, and component IDs in WordPress. A name like "Frame 47" is meaningless to a developer and forces them to guess the intent.',
    steps: ['Double-click the layer name in the Layers panel.', 'Use a descriptive semantic name: "Hero Section", "Primary CTA Button", "Team Card".', 'For text nodes, the plugin will rename them to their content automatically.', 'Use the "Rename generic layers" button to batch-fix all detected generic names.']
  },
  'deep-nesting': {
    why: 'Deeply nested wrapper frames add zero visual value but create complex DOM hierarchies in WordPress. Each unnecessary wrapper layer becomes an extra HTML div a developer must wade through.',
    steps: ['Select the nested wrapper frame.', 'Check if it serves a layout purpose (padding, overflow clipping) or is just grouping.', 'If purely structural, select all children (Cmd/Ctrl+A), cut, and paste them into the parent frame.', 'Delete the now-empty wrapper. Re-check that spacing and alignment are preserved.']
  },
  'missing-text-style': {
    why: 'Text without a linked style forces developers to hard-code font size, weight, and line-height inline. When the brand typography changes, they must hunt down every instance manually instead of updating one CSS variable.',
    steps: ['Select the text node.', 'In the right panel, look for "Text Styles" (the 4-dot grid icon near the font name).', 'Click the icon and pick an existing style that matches, or click "+" to create a new one.', 'Name the style semantically: "Heading/H2", "Body/Regular", "Label/Small".', 'Re-run the audit to confirm the issue resolves.']
  },
  'missing-color-style': {
    why: 'Unlinked fill colors become magic hex values in CSS. If the brand color changes from #1A73E8 to #1557B0, a developer must manually find and replace every instance instead of changing one CSS custom property.',
    steps: ['Select the layer with the unlinked fill.', 'In the Fill section of the right panel, click the 4-dot style icon.', 'Choose an existing color style or create a new one via "+".', 'Name it clearly: "Primary/Brand Blue", "Neutral/Background".', 'Alternatively, bind it to a Figma Variable for dark mode / theming support.']
  },
  'button-no-auto-layout': {
    why: 'Buttons built without Auto Layout have a fixed width that does not adapt to label length. Developers implementing this as a CSS button will end up with text overflow or rigid widths that break responsively.',
    steps: ['Select the button frame.', 'Press Shift+A (or right-click → Add Auto Layout).', 'Set Horizontal direction, add left/right padding to match your design (e.g. 20px).', 'Set "Hug" on width so the button shrinks/grows with its label.', 'Use the "Convert buttons to Auto Layout" action in this plugin to fix detected buttons automatically.']
  },
  'section-no-auto-layout': {
    why: 'Sections without Auto Layout use absolute coordinates for their children. Developers must hard-code each child\'s position in CSS, making the layout fragile and non-responsive when content changes.',
    steps: ['Select the section frame.', 'Press Shift+A to add Auto Layout.', 'Choose Vertical for stacked sections, Horizontal for side-by-side columns.', 'Set padding (top/bottom/left/right) to match the design\'s visual spacing.', 'Use the "Make Auto Layout" button in this plugin to batch-convert detected sections.']
  },
  'fixed-height-section': {
    why: 'A section with a fixed pixel height will clip content in WordPress when text length varies (CMS content, translations, user-generated data). Content-driven height adapts naturally.',
    steps: ['Select the section frame.', 'In the right panel, change Height from a fixed value to "Hug contents".', 'Add explicit padding-top and padding-bottom instead of relying on the frame height.', 'If the section must be a fixed height (e.g. full-viewport hero), set min-height in code and let the design show the minimum.']
  },
  'flatten-vectors': {
    why: 'Icon groups with multiple vector paths create unnecessary nesting in the exported SVG. A flat, merged vector exports as a single clean path that\'s easier to style, animate, and compress.',
    steps: ['Select the icon group.', 'Press Cmd/Ctrl+E (Flatten) to merge all paths into one.', 'Rename the resulting vector to something descriptive ("chevron-down", "arrow-right").', 'Use the "Flatten selected vectors" button to flatten all detected icons at once.']
  },
  'empty-group': {
    why: 'Empty groups are leftover containers that add clutter to the layer panel, confuse developers, and can cause unexpected behaviour when scripts iterate over all children.',
    steps: ['Select the empty group.', 'Press Backspace or Delete to remove it.', 'If the group was intentional (placeholder), add a comment or rename it to "~placeholder" to signal intent.']
  },
  'strokes-found': {
    why: 'Thin decorative strokes on vector or line nodes are brittle in CSS. They do not scale correctly at different pixel densities and force developers to use SVG stroke-width instead of a simpler border or background approach.',
    steps: ['Select the node with the thin stroke.', 'If it is a separator, convert it to a 1px-tall rectangle with a fill instead of a LINE with a stroke.', 'If it is an icon outline, keep the stroke inside the vector and flatten the paths (Cmd/Ctrl+E).', 'For container borders (cards, inputs), use the frame\'s own stroke property — those map cleanly to CSS border.']
  },
  'line-object': {
    why: 'Figma LINE nodes export poorly — they have no area, making them tricky to interact with and impossible to style consistently. CSS borders on containers are more robust and semantically correct.',
    steps: ['Delete the LINE node.', 'Select the container frame above or below the line.', 'Add a bottom border (stroke) to the container frame in Figma.', 'In code, this becomes border-bottom: 1px solid <color> on the parent element — reliable and responsive.']
  },
  'mask-found': {
    why: 'Figma masks clip a layer using another layer\'s shape. In WordPress this maps to CSS clip-path or overflow:hidden, which can cause unexpected clipping on mobile or when content grows. An Image Fill achieves the same crop with zero extra DOM nodes.',
    steps: ['Identify what the mask is clipping (usually a photo inside a shape).', 'Delete the mask layer and the masked image.', 'Select the shape that was the mask (rectangle, circle, etc.).', 'Add an Image Fill to that shape instead: Fill panel → click "+" → choose Image.', 'The shape now holds the image natively — no mask needed.']
  },
  'background-layer': {
    why: 'A standalone full-width rectangle used only as a background creates an extra DOM element. Applying the fill directly to the parent container eliminates the extra layer and keeps the HTML shallower.',
    steps: ['Note the fill color or image on the background rectangle.', 'Select the parent frame that contains this rectangle.', 'Apply the same fill to the parent frame directly.', 'Delete the standalone rectangle.', 'Verify nothing visually changed — the parent frame now carries the background.']
  },
  'missing-export': {
    why: 'Assets without export settings cannot be exported from Figma programmatically. Developers must manually drag images out, which breaks automated handoff pipelines and causes inconsistent resolution.',
    steps: ['Select the asset (image, icon, illustration).', 'In the right panel, scroll to "Export" at the bottom.', 'Click "+" to add an export preset.', 'For photos: PNG @2x. For icons/logos: SVG.', 'Use the "Mark exportable assets" button to bulk-add export settings to all detected assets.']
  },
  // v17 new checks
  'text-overflow': {
    why: 'The text node\'s bounding box extends past its parent container. In WordPress, browsers clip this overflow or wrap text differently depending on CSS rules — the rendered result will not match the design.',
    steps: ['Select the text node shown in the path above.', 'Option 1: Resize the parent frame so it is wide/tall enough to contain the text.', 'Option 2: Set the text\'s resize mode to "Auto height" or "Auto width" so it grows with content.', 'Option 3: Shorten the copy if it is placeholder text that will be shorter in production.', 'Re-run the audit to confirm the overflow is resolved.']
  },
  'auto-line-height': {
    why: 'Figma\'s AUTO line-height uses the font\'s internal metrics, which differ between operating systems and browsers. Without an explicit px or % value, the developer must guess — leading to subtle spacing differences between the design and the built page.',
    steps: ['Select the text node.', 'In the right panel, find the Line height field (looks like multi-line spacing icon).', 'Replace "Auto" with a specific value — common ratios: body text = 1.5× font size, headings = 1.1–1.25× font size.', 'For 16px body text, try 24px (150%) as a starting point.', 'Bind it to a text style so the value propagates across all matching text nodes.']
  },
  'near-dupe-spacing': {
    why: 'Near-identical spacing values (e.g. 30px and 32px) create multiple CSS custom properties that were probably meant to be one. This leads to inconsistent rhythm in the WordPress theme and is hard to fix after development.',
    steps: ['Open the Figma Variables panel (right panel → Local variables).', 'Create a Spacing collection with a defined scale: 8, 16, 24, 32, 48, 64, 96px.', 'Select each frame with the inconsistent spacing value.', 'In the Auto Layout padding/gap fields, click the variable icon and bind to the nearest scale value.', 'Delete any variables or direct values that fall between scale steps.']
  },
  'section-overlap': {
    why: 'Overlapping sections map to either a negative margin-top or position:absolute with z-index in CSS — both are fragile and can break the layout at different viewport widths or when content changes length.',
    steps: ['Check if the overlap is intentional (e.g. a card that visually bleeds into the next section).', 'If intentional: document it with a note on the frame ("Intentional overlap: card bleeds 40px into next section").', 'If unintentional: drag one section up or down until its bounding box no longer overlaps the other.', 'Use Figma\'s smart guides — hold Shift while dragging — to snap to integer Y values.', 'Re-run the audit to confirm the overlap is resolved.']
  },
  'missing-font': {
    why: 'Figma renders a fallback font when a font is not installed. The developer sees the correct font name in the spec but cannot reproduce the exact metrics — weight, tracking, and line-height all differ per font family.',
    steps: ['Install the missing font on your system. For Google Fonts: download from fonts.google.com and install via Font Book (macOS).', 'For licensed fonts: ask your brand team for the font file.', 'After installing, restart Figma — new fonts do not appear until Figma relaunches.', 'Alternative: replace the font in the design with one that is already available across your team.', 'Re-run the audit to confirm the font loads successfully.']
  },
  'no-mobile-frame': {
    why: 'WordPress themes are built mobile-first. Without a mobile frame, developers must guess how the layout adapts below 768px — breakpoints, font sizes, column stacking, and padding all need explicit design decisions.',
    steps: ['Duplicate your desktop frame (Cmd/Ctrl+D).', 'Resize the duplicate to 375px wide (standard iPhone viewport).', 'Adapt the layout: stack columns vertically, increase tap targets to ≥44px, adjust font sizes for readability.', 'Name the frame consistently with the desktop counterpart: "Home — Mobile" if desktop is "Home — Desktop".', 'Re-run the audit from this mobile frame to check for layout issues at the narrower width.']
  },
  'interactive-no-states': {
    why: 'Interactive components (carousels, accordions, modals, tabs) require multiple states to be implemented in WordPress — open/closed, hover, active, disabled. Without designed states, developers invent their own interactions, which will not match the intended UX.',
    steps: ['Select the interactive component.', 'Convert it to a Figma Component (Cmd/Ctrl+Alt+K) if it is not already one.', 'Add variants via the Component panel: "State=Default", "State=Hover", "State=Open" (for accordions/modals), "State=Active" (for tabs).', 'Design each state by duplicating the default and making the interaction-specific changes.', 'Use Prototype → Interactive Components to wire the states so they preview correctly in Figma.']
  },
  'multiple-fonts': {
    why: 'More than two distinct font families in a design often signals an accidental font substitution. Each unique font family adds an extra web font request in WordPress, increasing page load time and potentially mismatching the brand guidelines.',
    steps: ['Open the right panel and inspect the font family fields across text nodes.', 'Identify which font is the "intruder" — often a system font (Helvetica, Arial) that replaced a brand font that wasn\'t installed.', 'Select all text nodes using the unwanted font (Edit → Select All with Same Font).', 'Change the font family to the correct brand font.', 'Re-run the audit to confirm only the expected 1–2 font families remain.']
  }
};

let lastAuditNodeIds = [];
let lastAuditIssueTypesByNode = new Map();
let ignoredIssueKeys = new Set();
let lastUserSelectionIds = [];

function captureSelectionIds() {
  lastUserSelectionIds = figma.currentPage.selection.map(n => n.id);
}

async function restoreSelectionIds() {
  if (!lastUserSelectionIds.length) return;
  const restored = [];
  for (const id of lastUserSelectionIds) {
    try {
      const node = await figma.getNodeByIdAsync(id);
      if (node && isEditableNode(node) && node.parent) restored.push(node);
    } catch (e) {}
  }
  try {
    if (restored.length) figma.currentPage.selection = restored;
  } catch (e) {}
}

function pause() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

function normalizeName(name) {
  return (name || '').trim().toLowerCase();
}

function isSceneNode(node) {
  return node && typeof node.type === 'string' && node.visible !== undefined;
}

function hasChildren(node) {
  return node && 'children' in node && Array.isArray(node.children);
}

function isAutoLayoutFrame(node) {
  return (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') && node.layoutMode && node.layoutMode !== 'NONE';
}

function isLikelyButton(node) {
  const n = normalizeName(node.name);
  if (n.includes('button') || n.includes('btn') || n.includes('cta')) return true;
  if ((node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE' || node.type === 'GROUP') && hasChildren(node)) {
    if (isLikelySection(node) || isLikelySectionByStructure(node)) return false;
    const textChildren = node.children.filter(c => c.type === 'TEXT');
    return textChildren.length >= 1 && node.children.length <= 6 && node.width <= 420 && node.height <= 140;
  }
  return false;
}

function isLikelySection(node) {
  const n = normalizeName(node.name);
  return node.type === 'SECTION' || n.includes('section') || n.includes('hero') || n.includes('footer') || n.includes('header') || n.includes('testimonial') || n.includes('feature') || n.includes('content');
}

function isLikelySectionByStructure(node) {
  if (!node || !['FRAME', 'GROUP', 'COMPONENT', 'INSTANCE'].includes(node.type)) return false;
  const parent = node.parent;
  const w = typeof node.width === 'number' ? node.width : 0;
  const h = typeof node.height === 'number' ? node.height : 0;
  const pw = parent && typeof parent.width === 'number' ? parent.width : 0;
  const directOnPage = parent && parent.type === 'PAGE';
  const nearFullWidth = pw > 0 ? w >= pw * 0.7 : w >= 900;
  const substantialBlock = h >= 180;
  const hasManyChildren = hasChildren(node) && node.children.length >= 2;
  return ((directOnPage && substantialBlock) || (nearFullWidth && substantialBlock && hasManyChildren));
}

function shouldTreatAsSection(node) {
  return isLikelySection(node) || isLikelySectionByStructure(node);
}

function getVisibleEditableChildren(node) {
  if (!hasChildren(node)) return [];
  return node.children.filter(child => isEditableNode(child) && child.visible !== false);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function inferAutoLayoutAxis(node) {
  const children = getVisibleEditableChildren(node);
  if (children.length < 2) return 'VERTICAL';

  const centersX = children.map(c => (c.x || 0) + (c.width || 0) / 2);
  const centersY = children.map(c => (c.y || 0) + (c.height || 0) / 2);
  const spreadX = Math.max.apply(null, centersX) - Math.min.apply(null, centersX);
  const spreadY = Math.max.apply(null, centersY) - Math.min.apply(null, centersY);

  const widths = children.map(c => c.width || 0);
  const heights = children.map(c => c.height || 0);
  const medianWidth = median(widths);
  const medianHeight = median(heights);

  const sortedByY = children.slice().sort((a, b) => a.y - b.y);
  const sortedByX = children.slice().sort((a, b) => a.x - b.x);

  const ySteps = [];
  for (let i = 1; i < sortedByY.length; i++) {
    ySteps.push(Math.abs((sortedByY[i].y || 0) - (sortedByY[i - 1].y || 0)));
  }
  const xSteps = [];
  for (let i = 1; i < sortedByX.length; i++) {
    xSteps.push(Math.abs((sortedByX[i].x || 0) - (sortedByX[i - 1].x || 0)));
  }

  const medianYStep = median(ySteps);
  const medianXStep = median(xSteps);

  const looksHorizontal =
    (spreadX > spreadY * 1.25 && medianWidth > medianHeight * 0.6) ||
    (medianXStep > 0 && medianXStep >= medianYStep * 1.25 && spreadX > medianWidth);

  return looksHorizontal ? 'HORIZONTAL' : 'VERTICAL';
}

function inferItemSpacing(node, axis) {
  const children = getVisibleEditableChildren(node);
  if (children.length < 2) return 0;
  const sorted = children.slice().sort((a, b) => axis === 'HORIZONTAL' ? a.x - b.x : a.y - b.y);
  const gaps = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const prevEnd = axis === 'HORIZONTAL' ? (prev.x || 0) + (prev.width || 0) : (prev.y || 0) + (prev.height || 0);
    const currStart = axis === 'HORIZONTAL' ? (curr.x || 0) : (curr.y || 0);
    const gap = Math.round(currStart - prevEnd);
    if (gap >= 0 && gap < 500) gaps.push(gap);
  }
  return Math.max(0, Math.round(median(gaps)));
}

function applySmartAutoLayout(frame) {
  const axis = inferAutoLayoutAxis(frame);
  frame.layoutMode = axis;
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
  frame.primaryAxisAlignItems = 'MIN';
  frame.counterAxisAlignItems = 'MIN';
  frame.itemSpacing = inferItemSpacing(frame, axis);
  if ('strokesIncludedInLayout' in frame) frame.strokesIncludedInLayout = true;
  return axis;
}

function isVectorLikeNode(node) {
  return !!node && ['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'ELLIPSE', 'POLYGON', 'RECTANGLE', 'LINE'].includes(node.type);
}

function hasImageFill(node) {
  return !!node && ('fills' in node) && node.fills !== figma.mixed && Array.isArray(node.fills) && node.fills.some(f => f.type === 'IMAGE');
}

function isRasterLikeNode(node) {
  const n = normalizeName(node.name || '');
  return hasImageFill(node) || n.includes('image') || n.includes('photo') || n.includes('hero') || n.includes('banner') || n.includes('thumbnail');
}

function isVectorContainer(node) {
  return hasChildren(node) && node.children.length > 0 && node.children.every(c => isVectorLikeNode(c));
}

function getExportSpec(node) {
  const imageLike = isRasterLikeNode(node);
  const vectorLike = isVectorLikeNode(node) || isVectorContainer(node);
  if (imageLike) {
    return { format: 'PNG', constraint: { type: 'SCALE', value: 2 }, suffix: '' };
  }
  if (vectorLike || /icon|logo|illustration|graphic/.test(normalizeName(node.name))) {
    return { format: 'SVG', contentsOnly: true, suffix: '' };
  }
  return { format: 'PNG', constraint: { type: 'SCALE', value: 2 }, suffix: '' };
}

function getAllNodes(rootNodes) {
  const out = [];
  const visit = (node, depth = 0, parent = null) => {
    if (!isSceneNode(node)) return;
    out.push({ node, depth, parent });
    if (hasChildren(node)) {
      for (const child of node.children) visit(child, depth + 1, node);
    }
  };
  for (const root of rootNodes) visit(root, 0, null);
  return out;
}

function getScopeNodes() {
  return figma.currentPage.selection.length ? figma.currentPage.selection : figma.currentPage.children;
}

async function resolveNodesByIds(ids) {
  const out = [];
  for (const id of ids) {
    try {
      const node = await figma.getNodeByIdAsync(id);
      if (node) out.push(node);
    } catch (e) {}
  }
  return out;
}

async function getActionNodes(preferIssueTypes = null) {
  let nodes = [];
  if (lastAuditNodeIds.length) {
    nodes = await resolveNodesByIds(lastAuditNodeIds);
  } else {
    nodes = getAllNodes(getScopeNodes()).map(x => x.node);
  }
  if (preferIssueTypes && preferIssueTypes.length) {
    nodes = nodes.filter(node => {
      const issueTypes = lastAuditIssueTypesByNode.get(node.id) || [];
      return issueTypes.some(type => preferIssueTypes.includes(type));
    });
  }
  const seen = new Set();
  return nodes.filter(node => {
    if (!node || seen.has(node.id)) return false;
    seen.add(node.id);
    return true;
  });
}

function getVisibleTextCandidates(node, limit = 24) {
  const out = [];
  const visit = (current) => {
    if (!current || out.length >= limit) return;
    if (current.type === 'TEXT') {
      const text = (current.characters || '').replace(/\s+/g, ' ').trim();
      if (text) out.push({ node: current, text, size: typeof current.fontSize === 'number' ? current.fontSize : 0, y: typeof current.y === 'number' ? current.y : 0 });
      return;
    }
    if (hasChildren(current) && !ancestorTypes(current).includes('INSTANCE')) {
      for (const child of current.children) {
        if (out.length >= limit) break;
        visit(child);
      }
    }
  };
  visit(node);
  return out;
}

function prettifySectionLabel(text) {
  if (!text) return '';
  let t = text.replace(/[|•·]+/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/^(welcome to|discover|explore|learn more about)\s+/i, '');
  t = t.replace(/[.!?,:;]+$/g, '').trim();
  if (!t) return '';
  const words = t.split(' ').filter(Boolean).slice(0, 4);
  const cleaned = words.join(' ');
  return cleaned.length > 40 ? cleaned.slice(0, 40).trim() : cleaned;
}

function inferSectionNameFromContent(node) {
  const texts = getVisibleTextCandidates(node);
  if (!texts.length) return '';
  texts.sort((a, b) => {
    if ((b.size || 0) !== (a.size || 0)) return (b.size || 0) - (a.size || 0);
    return (a.y || 0) - (b.y || 0);
  });
  for (const item of texts) {
    const label = prettifySectionLabel(item.text);
    if (!label) continue;
    if (/^(home|menu|read more|learn more|contact us|get started)$/i.test(label)) continue;
    const suffix = /section$/i.test(label) ? '' : ' Section';
    return label + suffix;
  }
  return '';
}

function inferName(node) {
  if (node.type === 'TEXT') {
    const text = (node.characters || '').trim();
    if (!text) return 'Text Content';
    return text.length > 32 ? text.slice(0, 32).trim() + '…' : text;
  }
  if (isLikelyButton(node)) {
    const texts = getVisibleTextCandidates(node, 6);
    const label = texts.length ? prettifySectionLabel(texts[0].text) : '';
    return label ? label + ' Button' : 'Button';
  }
  if (isLikelySection(node) || node.type === 'FRAME' || node.type === 'GROUP' || node.type === 'COMPONENT' || node.type === 'SECTION') {
    const fromContent = inferSectionNameFromContent(node);
    if (fromContent) return fromContent;
    if (isLikelySection(node)) return 'Section';
  }
  if (node.type === 'RECTANGLE' && hasImageFill(node)) return 'Image';
  if (node.type === 'VECTOR' || node.type === 'BOOLEAN_OPERATION') return 'Icon';
  if (node.type === 'LINE') return 'Divider';
  if (node.type === 'GROUP') return 'Content Group';
  if (node.type === 'FRAME') return 'Content Frame';
  if (node.type === 'COMPONENT') return 'Component Block';
  return node.type.charAt(0) + node.type.slice(1).toLowerCase();
}

function nodePath(node) {
  const parts = [];
  let current = node;
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    parts.unshift(current.name);
    current = current.parent;
  }
  return parts.join(' › ');
}

function hasStyleOrVariableForText(node) {
  if (node.type !== 'TEXT') return true;
  const hasStyle = !!node.textStyleId && node.textStyleId !== figma.mixed;
  const bound = node.boundVariables || {};
  const hasVar = !!bound.fontSize || !!bound.fontFamily || !!bound.fontWeight || !!bound.letterSpacing || !!bound.lineHeight || !!bound.paragraphSpacing || !!bound.fills || !!bound.textRangeFills;
  return hasStyle || hasVar;
}

function paintUsesStyleOrVariable(node) {
  if (!('fills' in node)) return true;
  if (node.fills === figma.mixed) return true;
  if (!Array.isArray(node.fills) || node.fills.length === 0) return true;
  const solidPaints = node.fills.filter(f => f.type === 'SOLID');
  if (solidPaints.length === 0) return true;

  const hasStyle = 'fillStyleId' in node && !!node.fillStyleId && node.fillStyleId !== figma.mixed;
  const nodeBound = node.boundVariables || {};
  const hasNodeVar = !!nodeBound.fills || !!nodeBound.fill || !!nodeBound.color;
  const hasPaintVar = solidPaints.some(p => !!p.boundVariables && (!!p.boundVariables.color || !!p.boundVariables.opacity));
  return hasStyle || hasNodeVar || hasPaintVar;
}

function ancestorTypes(node) {
  const out = [];
  let current = node.parent;
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    out.push(current.type);
    current = current.parent;
  }
  return out;
}

function isEditableNode(node) {
  return !!node && !node.removed;
}

function getBlockedReason(node, action) {
  if (!isEditableNode(node)) return 'Node no longer exists.';
  if (node.locked) return 'Node is locked.';
  const ancestors = ancestorTypes(node);
  if (ancestors.includes('INSTANCE')) return 'Node is inside an instance. Figma blocks this edit unless you detach the instance.';
  if ((action === 'remove-hidden' || action === 'rename-generic' || action === 'convert-buttons' || action === 'add-export-settings' || action === 'section-auto-layout') && node.parent && node.parent.type === 'INSTANCE') {
    return 'Node is inside an instance. Figma blocks this edit unless you detach the instance.';
  }
  if (action === 'convert-buttons' && node.type === 'INSTANCE') return 'This button is an instance. Detach it before converting layout.';
  if (action === 'flatten-vectors' && ancestorTypes(node).includes('INSTANCE')) return 'Vector is inside an instance. Detach the instance before flattening.';
  return null;
}

function shouldIgnoreIssue(nodeId, type) {
  return ignoredIssueKeys.has(`${nodeId}:${type}`);
}

function addIssue(issues, stats, type, severity, message, node, statKey, action = null, extra = {}) {
  if (shouldIgnoreIssue(node.id, type)) return;
  const blockedReason = action ? getBlockedReason(node, action) : null;
  const actionable = action ? !blockedReason : false;
  if (statKey) stats[statKey]++;
  if (action && actionable) stats.actionable[statKey] = (stats.actionable[statKey] || 0) + 1;
  const issue = {
    type: type,
    severity: severity,
    message: message,
    nodeId: node.id,
    path: nodePath(node),
    actionable: actionable,
    blockedReason: blockedReason,
    action: action,
    details: ISSUE_DETAILS[type] || null
  };
  for (const k in extra) issue[k] = extra[k];
  issues.push(issue);
}

function isGenericName(node) {
  const raw = (node.name || '').trim();
  const name = normalizeName(raw);
  if (isVectorLikeNode(node)) return false;
  if (!raw) return true;
  if (/^(frame|group|rectangle|text|component|instance)(\s+\d+)?$/i.test(raw)) return true;
  if (GENERIC_NAMES.has(name) && name !== 'vector' && name !== 'line' && name !== 'ellipse' && name !== 'polygon' && name !== 'star') return true;
  return false;
}

function wrapperLike(node) {
  if (!node) return false;
  const n = normalizeName(node.name);
  if (!(node.type === 'FRAME' || node.type === 'GROUP' || node.type === 'COMPONENT')) return false;
  return isGenericName(node) || n.includes('wrapper') || n.includes('inner') || n.includes('outer');
}

function deepWrapperDepth(entry) {
  let depth = 0;
  let current = entry.node;
  while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
    if (wrapperLike(current)) {
      depth++;
    } else {
      break;
    }
    current = current.parent;
  }
  return depth;
}

function hasFixedHeightSignal(node) {
  return (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'SECTION') && typeof node.height === 'number' && !isAutoLayoutFrame(node) && node.height >= 240;
}

function isExportableLeaf(node) {
  if (!isEditableNode(node)) return false;
  if (node.type === 'INSTANCE') return false;

  const name = normalizeName(node.name);
  const children = hasChildren(node) ? node.children.filter(c => isEditableNode(c)) : [];
  const hasRasterFill = hasImageFill(node);
  const semanticAssetName = /image|photo|hero|banner|thumbnail|logo|icon|illustration|graphic|map|media/.test(name);
  const leafishContainer = ['FRAME', 'COMPONENT', 'GROUP', 'RECTANGLE'].includes(node.type) && (
    children.length === 0 ||
    semanticAssetName ||
    (children.length <= 2 && children.every(c => c.type === 'VECTOR' || c.type === 'TEXT'))
  );
  const likelyLayoutContainer = ['FRAME', 'COMPONENT', 'SECTION'].includes(node.type) && children.length >= 3 && !semanticAssetName && !hasRasterFill;

  if (hasRasterFill && !likelyLayoutContainer && leafishContainer) return true;
  if (['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'ELLIPSE', 'POLYGON', 'LINE'].includes(node.type)) return true;

  if (node.type === 'GROUP' && children.length > 0) {
    const directRaster = children.filter(c => hasImageFill(c));
    const directVectors = children.filter(c => isVectorLikeNode(c));
    if (directRaster.length === 1 && children.length <= 3) return true;
    if (directVectors.length >= 2 && children.length === directVectors.length && (semanticAssetName || (node.width <= 600 && node.height <= 600))) return true;
  }
  return false;
}

function gatherExportCandidates(roots) {
  const entries = getAllNodes(roots);
  const candidates = [];
  const seen = new Set();

  const addCandidate = (node) => {
    if (!node || seen.has(node.id)) return;
    if (node.exportSettings && node.exportSettings.length > 0) return;
    if (isExportableLeaf(node)) {
      candidates.push(node);
      seen.add(node.id);
    }
  };

  for (const root of roots) addCandidate(root);

  for (const { node } of entries) {
    if (!isEditableNode(node) || seen.has(node.id)) continue;
    if (node.exportSettings && node.exportSettings.length > 0) continue;

    if (isExportableLeaf(node)) {
      let hasExportableAncestor = false;
      let current = node.parent;
      while (current && current.type !== 'PAGE' && current.type !== 'DOCUMENT') {
        if (seen.has(current.id)) {
          hasExportableAncestor = true;
          break;
        }
        current = current.parent;
      }
      if (!hasExportableAncestor) {
        candidates.push(node);
        seen.add(node.id);
        continue;
      }
    }

    if ((node.type === 'GROUP' || node.type === 'FRAME' || node.type === 'COMPONENT') && hasChildren(node)) {
      const imageChildren = node.children.filter(c => hasImageFill(c) && (!c.exportSettings || c.exportSettings.length === 0));
      if (imageChildren.length === 1 && node.children.length <= 4 && !seen.has(imageChildren[0].id)) {
        candidates.push(imageChildren[0]);
        seen.add(imageChildren[0].id);
      }
    }
  }
  return candidates;
}

function createEmptyStats(checkedNodes = 0) {
  return {
    checkedNodes,
    hiddenLayers: 0,
    genericNames: 0,
    deepNesting: 0,
    missingTextStyles: 0,
    missingColorStyles: 0,
    buttonsWithoutAutoLayout: 0,
    fixedSectionHeights: 0,
    vectorsToFlatten: 0,
    strokesFound: 0,
    lineObjects: 0,
    masksFound: 0,
    missingExportSettings: 0,
    sectionsWithoutAutoLayout: 0,
    backgroundWrappers: 0,
    emptyGroups: 0,
    // v17 new stats
    textOverflow: 0,
    autoLineHeight: 0,
    nearDupSpacing: 0,
    sectionOverlaps: 0,
    missingFonts: 0,
    noMobileFrame: 0,
    interactivePatterns: 0,
    multipleFonts: 0,
    actionable: {}
  };
}

function summarizeIssues(issues, checkedNodes, scope) {
  const stats = createEmptyStats(checkedNodes);
  for (const issue of issues) {
    const key = ISSUE_TO_STAT[issue.type];
    if (key) stats[key]++;
    if (issue.actionable && issue.action && key) stats.actionable[key] = (stats.actionable[key] || 0) + 1;
  }
  return { issues, stats, scope };
}

async function collectIssues() {
  const scopeNodes = getScopeNodes();
  const entries = getAllNodes(scopeNodes);
  const issues = [];
  const stats = createEmptyStats(entries.length);
  const batchSize = 120;

  for (let i = 0; i < entries.length; i++) {
    const { node, depth, parent } = entries[i];
    try {
      const name = normalizeName(node.name);

      if (!node.visible) addIssue(issues, stats, 'hidden-layer', 'medium', 'Hidden layer should be removed before handoff.', node, 'hiddenLayers', 'remove-hidden');

      if (isGenericName(node)) addIssue(issues, stats, 'generic-name', 'medium', 'Layer name is generic. Use a clear and descriptive name.', node, 'genericNames', 'rename-generic');

      if (deepWrapperDepth({ node }) >= 3 || (depth >= 5 && wrapperLike(parent))) {
        addIssue(issues, stats, 'deep-nesting', 'medium', 'Hierarchy is deeply nested with wrapper-like containers. Keep nesting only where it is structurally needed.', node, 'deepNesting');
      }

      if (node.type === 'TEXT' && !hasStyleOrVariableForText(node)) {
        addIssue(issues, stats, 'missing-text-style', 'high', 'Text is not linked to a text style or variable.', node, 'missingTextStyles');
      }

      if (('fills' in node) && !paintUsesStyleOrVariable(node)) {
        addIssue(issues, stats, 'missing-color-style', 'high', 'Solid fill is not linked to a style or variable.', node, 'missingColorStyles');
      }

      if (isLikelyButton(node) && !isAutoLayoutFrame(node)) {
        const hasButtonAncestorWithAutoLayout = ancestorTypes(node).includes('FRAME') && node.parent && isAutoLayoutFrame(node.parent);
        if (!hasButtonAncestorWithAutoLayout) {
          addIssue(issues, stats, 'button-no-auto-layout', 'high', 'Button should be built with an Auto Layout frame.', node, 'buttonsWithoutAutoLayout', 'convert-buttons');
        }
      }

      if (shouldTreatAsSection(node) && (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE' || node.type === 'GROUP')) {
        const hasAutoLayoutChildren = hasChildren(node) && node.children.some(child => 
          (child.type === 'FRAME' || child.type === 'COMPONENT' || child.type === 'INSTANCE') && isAutoLayoutFrame(child)
        );
        if (!isAutoLayoutFrame(node) && !hasAutoLayoutChildren) {
          addIssue(issues, stats, 'section-no-auto-layout', 'high', 'Section should use Auto Layout for stacking and responsive behavior.', node, 'sectionsWithoutAutoLayout', 'section-auto-layout');
        }
        if (hasFixedHeightSignal(node)) {
          addIssue(issues, stats, 'fixed-height-section', 'medium', 'Section appears to rely on a fixed height. Prefer content-driven height with padding.', node, 'fixedSectionHeights');
        }
      }

      if ((node.type === 'GROUP' || node.type === 'FRAME' || node.type === 'COMPONENT') && hasChildren(node)) {
        const directVectorLike = node.children.filter(c => ['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'ELLIPSE', 'POLYGON', 'RECTANGLE'].includes(c.type));
        const isIcon = node.width <= 64 && node.height <= 64;
        const isSmallGraphic = node.width <= 150 && node.height <= 150;
        const hasIconName = node.name.toLowerCase().includes('icon') || node.name.toLowerCase().includes('ico');
        if (directVectorLike.length >= 2 && (isIcon || (isSmallGraphic && hasIconName))) {
          addIssue(issues, stats, 'flatten-vectors', 'low', 'Icon vector group may be flattened to reduce nested structure.', node, 'vectorsToFlatten', 'flatten-vectors');
        }
        if (node.type === 'GROUP' && node.children.length === 0) {
          addIssue(issues, stats, 'empty-group', 'medium', 'Empty group should be removed.', node, 'emptyGroups');
        }
      }

      if ('strokes' in node && node.strokes !== figma.mixed && Array.isArray(node.strokes) && node.strokes.length > 0) {
        const strokeWeight = ('strokeWeight' in node && typeof node.strokeWeight === 'number') ? node.strokeWeight : 0;
        const isContainerBorder = ['FRAME', 'COMPONENT', 'SECTION'].includes(node.type);
        const isLikelySeparator = node.type === 'LINE' || (strokeWeight <= 1 && Math.min(node.width || 0, node.height || 0) <= 2);
        const isDecorativeVectorStroke = ['VECTOR', 'BOOLEAN_OPERATION', 'STAR', 'ELLIPSE', 'POLYGON'].includes(node.type) && strokeWeight <= 1;
        if (!isContainerBorder && (isLikelySeparator || isDecorativeVectorStroke)) {
          addIssue(issues, stats, 'strokes-found', 'low', 'Thin stroke may be better handled as a fill or dedicated separator asset.', node, 'strokesFound');
        }
      }

      if (node.type === 'LINE') addIssue(issues, stats, 'line-object', 'high', 'Avoid line objects for separators. Use borders on the relevant container instead.', node, 'lineObjects');
      if ('isMask' in node && node.isMask) addIssue(issues, stats, 'mask-found', 'high', 'Avoid masks where Image Fill can be used instead.', node, 'masksFound');

      // ── v17: Text overflow ─────────────────────────────────────────────
      if (node.type === 'TEXT' && node.absoluteBoundingBox && node.parent && node.parent.absoluteBoundingBox && node.parent.type !== 'PAGE') {
        const tb = node.absoluteBoundingBox;
        const pb = node.parent.absoluteBoundingBox;
        const overflowRight  = (tb.x + tb.width)  - (pb.x + pb.width);
        const overflowBottom = (tb.y + tb.height) - (pb.y + pb.height);
        if (overflowRight > 5 || overflowBottom > 5) {
          const px = Math.round(Math.max(overflowRight, overflowBottom));
          addIssue(issues, stats, 'text-overflow', 'high', `Text overflows its container by ${px}px — content will clip at runtime.`, node, 'textOverflow');
        }
      }

      // ── v17: Auto line-height ──────────────────────────────────────────
      if (node.type === 'TEXT' && node.lineHeight !== figma.mixed) {
        const lh = node.lineHeight;
        if (lh && lh.unit === 'AUTO') {
          addIssue(issues, stats, 'auto-line-height', 'medium', 'Text uses AUTO line-height — developers need an explicit value to implement accurately.', node, 'autoLineHeight');
        }
      }


      // ── v17: Interactive component without state variants ──────────────
      const INTERACTIVE_RX = [
        { rx: /\b(carousel|slider|swiper|slideshow)\b/i, label: 'carousel' },
        { rx: /\b(accordion|collapse|expander|faq)\b/i,  label: 'accordion' },
        { rx: /\btabs?\b/i,                               label: 'tabs' },
        { rx: /\b(modal|popup|dialog|overlay|lightbox)\b/i, label: 'modal' },
      ];
      const STATE_HINT = /\b(hover|active|pressed|open|closed|focus|disabled|expanded|collapsed)\b/i;
      for (const { rx, label } of INTERACTIVE_RX) {
        if (rx.test(node.name) && hasChildren(node)) {
          const childNames = node.children.map(c => c.name).join(' ');
          const siblingNames = node.parent && node.parent.type === 'COMPONENT_SET'
            ? node.parent.children.map(c => c.name).join(' ')
            : '';
          if (!STATE_HINT.test(childNames) && !STATE_HINT.test(siblingNames)) {
            addIssue(issues, stats, 'interactive-no-states', 'low', `"${node.name}" looks like a ${label} but has no state variants (hover, open, closed).`, node, 'interactivePatterns');
          }
          break;
        }
      }

      if (parent && hasChildren(parent) && (parent.type === 'FRAME' || parent.type === 'GROUP')) {
        const siblings = parent.children;
        const bgRects = siblings.filter(c => c.type === 'RECTANGLE' && !c.isMask && c.width >= parent.width * 0.9 && c.height >= parent.height * 0.9);
        const isImageContainer = node.fills && node.fills !== figma.mixed && node.fills.some(f => f.type === 'IMAGE');
        const isStandaloneImageFrame = isImageContainer && siblings.length === 1;
        if (bgRects.length === 1 && node === bgRects[0] && !isImageContainer && !isStandaloneImageFrame) {
          addIssue(issues, stats, 'background-layer', 'low', 'Background may be better applied directly on the container.', node, 'backgroundWrappers');
        }
      }
    } catch (e) {
      // swallow per-node audit errors for stability on heavy files
    }

    if ((i + 1) % batchSize === 0 || i === entries.length - 1) {
      figma.ui.postMessage({
        type: 'progress',
        stage: 'Auditing file',
        completed: i + 1,
        total: entries.length
      });
      await pause();
    }
  }

  const exportCandidates = gatherExportCandidates(scopeNodes);
  for (const node of exportCandidates) {
    addIssue(issues, stats, 'missing-export', 'medium', 'Asset should be marked exportable.', node, 'missingExportSettings', 'add-export-settings');
  }

  // ── v17: Near-duplicate spacing (aggregate, post-loop) ──────────────────
  try {
    const spacingVals = [];
    for (const { node: n } of entries) {
      if ((n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'INSTANCE') && n.layoutMode && n.layoutMode !== 'NONE') {
        [n.paddingTop, n.paddingBottom, n.paddingLeft, n.paddingRight, n.itemSpacing]
          .filter(v => typeof v === 'number' && v > 0 && v < 1000)
          .forEach(v => spacingVals.push(Math.round(v)));
      }
    }
    const uniqSpacing = [...new Set(spacingVals)].sort((a, b) => a - b);
    const dupePairs = [];
    for (let i = 0; i < uniqSpacing.length - 1; i++) {
      const diff = uniqSpacing[i + 1] - uniqSpacing[i];
      if (diff > 0 && diff <= 2) dupePairs.push([uniqSpacing[i], uniqSpacing[i + 1]]);
    }
    if (dupePairs.length > 0) {
      const pairText = dupePairs.slice(0, 3).map(([a, b]) => `${a}px / ${b}px`).join(', ');
      addIssue(issues, stats, 'near-dupe-spacing', 'low', `Near-duplicate spacing values: ${pairText}. Standardize to a consistent scale.`, figma.currentPage, 'nearDupSpacing');
    }
  } catch (e) {}

  // ── v17: Section overlaps (aggregate, post-loop) ─────────────────────────
  try {
    const topSections = scopeNodes.flatMap(root => {
      if (!hasChildren(root)) return [];
      return root.children.filter(c =>
        c.visible !== false && c.absoluteBoundingBox &&
        ['FRAME', 'COMPONENT', 'GROUP', 'SECTION'].includes(c.type)
      );
    }).sort((a, b) => a.absoluteBoundingBox.y - b.absoluteBoundingBox.y);
    for (let i = 0; i < topSections.length - 1; i++) {
      const curr = topSections[i].absoluteBoundingBox;
      const next = topSections[i + 1].absoluteBoundingBox;
      const overlap = (curr.y + curr.height) - next.y;
      if (overlap > 2) {
        addIssue(issues, stats, 'section-overlap', 'medium', `"${topSections[i].name}" overlaps "${topSections[i + 1].name}" by ${Math.round(overlap)}px.`, topSections[i], 'sectionOverlaps');
      }
    }
  } catch (e) {}

  // ── v17: Missing fonts (async, post-loop) ────────────────────────────────
  try {
    const fontKeyMap = new Map();
    for (const { node: n } of entries) {
      if (n.type === 'TEXT' && n.visible !== false && n.fontName !== figma.mixed && n.fontName) {
        const key = `${n.fontName.family}::${n.fontName.style}`;
        if (!fontKeyMap.has(key)) fontKeyMap.set(key, n);
      }
    }
    for (const [key, representativeNode] of fontKeyMap) {
      const [family, style] = key.split('::');
      try {
        await figma.loadFontAsync({ family, style });
      } catch (e) {
        addIssue(issues, stats, 'missing-font', 'high', `Font "${family} ${style}" is not available — text will render with a fallback.`, representativeNode, 'missingFonts');
      }
    }
  } catch (e) {}

  // ── v17: Multiple font families (aggregate, post-loop) ───────────────────
  try {
    const families = new Set();
    for (const { node: n } of entries) {
      if (n.type === 'TEXT' && n.visible !== false && n.fontName !== figma.mixed && n.fontName) {
        families.add(n.fontName.family);
      }
    }
    if (families.size > 2) {
      addIssue(issues, stats, 'multiple-fonts', 'low', `${families.size} distinct font families detected: ${[...families].slice(0, 4).join(', ')}${families.size > 4 ? '…' : ''}.`, figma.currentPage, 'multipleFonts');
    }
  } catch (e) {}

  // ── v17: No mobile frame (page-level) ────────────────────────────────────
  try {
    const pageFrames = figma.currentPage.children.filter(n => n.type === 'FRAME');
    const hasDesktop = pageFrames.some(f => f.width > 1024);
    const hasMobile  = pageFrames.some(f => f.width <= 480);
    if (hasDesktop && !hasMobile) {
      addIssue(issues, stats, 'no-mobile-frame', 'medium', 'No mobile frame found on this page. WordPress themes require responsive design for all breakpoints.', figma.currentPage, 'noMobileFrame');
    }
  } catch (e) {}

  return { issues, stats, scope: figma.currentPage.selection.length ? 'selection' : 'page' };
}

async function renameGenericLayers() {
  const nodes = await getActionNodes(['generic-name']);
  let changed = 0;
  let skipped = 0;
  const reasons = [];
  for (const node of nodes) {
    if (!isGenericName(node)) continue;
    const blocked = getBlockedReason(node, 'rename-generic');
    if (blocked) {
      skipped++;
      if (reasons.length < 3) reasons.push(blocked);
      continue;
    }
    const nextName = inferName(node);
    if (!nextName || node.name === nextName) continue;
    try {
      node.name = nextName;
      changed++;
    } catch (e) {
      skipped++;
      if (reasons.length < 3) reasons.push(e && e.message ? e.message : 'Rename failed.');
    }
  }
  return { changed, skipped, reasons };
}

async function removeHiddenLayers() {
  const nodes = (await getActionNodes(['hidden-layer']))
    .map(node => ({ node, depth: nodePath(node).split('›').length }))
    .sort((a, b) => b.depth - a.depth)
    .map(x => x.node);
  let changed = 0;
  let skipped = 0;
  const reasons = [];
  for (const node of nodes) {
    if (!node.visible) {
      const blocked = getBlockedReason(node, 'remove-hidden');
      if (blocked) {
        skipped++;
        if (reasons.length < 3) reasons.push(blocked);
        continue;
      }
      try {
        if (node.parent && typeof node.remove === 'function') {
          node.remove();
          changed++;
        }
      } catch (e) {
        skipped++;
        if (reasons.length < 3) reasons.push(e && e.message ? e.message : 'Remove failed.');
      }
    }
  }
  return { changed, skipped, reasons };
}

async function addExportSettings() {
  const roots = getScopeNodes();
  let nodes = [];
  if (lastAuditNodeIds.length) {
    const audited = await getActionNodes(['missing-export']);
    if (audited.length) nodes = audited;
  }
  if (!nodes.length) nodes = gatherExportCandidates(roots);

  let changed = 0;
  let skipped = 0;
  const reasons = [];
  const seen = new Set();
  for (const node of nodes) {
    if (!node || seen.has(node.id)) continue;
    seen.add(node.id);
    if (!isExportableLeaf(node)) continue;
    if (node.exportSettings && node.exportSettings.length > 0) continue;
    const blocked = getBlockedReason(node, 'add-export-settings');
    if (blocked) {
      skipped++;
      if (reasons.length < 3) reasons.push(blocked);
      continue;
    }
    try {
      node.exportSettings = [getExportSpec(node)];
      changed++;
    } catch (e) {
      skipped++;
      if (reasons.length < 3) reasons.push(e && e.message ? e.message : 'Export settings failed.');
    }
  }

  if (!changed && !skipped && figma.currentPage.selection.length) {
    reasons.push('No exportable assets were found in the current selection. Select the image, icon, logo, or the group that directly contains them. Standalone image layers are supported when they use image fills.');
  }
  return { changed, skipped, reasons };
}

function addFlattenBucket(map, parent, nodes) {
  if (!parent || !nodes || nodes.length < 2) return;
  const editable = nodes.filter(n => isEditableNode(n) && !getBlockedReason(n, 'flatten-vectors'));
  if (editable.length < 2) return;
  const key = parent.id;
  if (!map.has(key)) map.set(key, { parent, nodes: [] });
  Array.prototype.push.apply(map.get(key).nodes, editable);
}

function gatherFlattenBucketsFromNode(root, buckets, reasons) {
  if (!root) return;
  const visit = (node) => {
    if (!node) return;
    const blocked = getBlockedReason(node, 'flatten-vectors');
    if (blocked) {
      if (reasons.length < 3 && !reasons.includes(blocked) && ancestorTypes(node).includes('INSTANCE')) reasons.push(blocked);
      return;
    }
    if (isVectorLikeNode(node) && node.parent && hasChildren(node.parent)) {
      const directSiblings = node.parent.children.filter(child => isVectorLikeNode(child));
      if (directSiblings.length >= 2) addFlattenBucket(buckets, node.parent, directSiblings);
    }
    if (hasChildren(node)) {
      const directVectorChildren = node.children.filter(child => isVectorLikeNode(child));
      if (directVectorChildren.length >= 2) addFlattenBucket(buckets, node, directVectorChildren);
      for (const child of node.children) visit(child);
    }
  };
  visit(root);
}

async function flattenSelectedVectorGroups() {
  const explicitSelection = figma.currentPage.selection.length ? figma.currentPage.selection.slice() : [];
  const auditedTargets = explicitSelection.length ? [] : await getActionNodes(['flatten-vectors']);
  const targets = explicitSelection.length ? explicitSelection : auditedTargets;
  let changed = 0;
  let skipped = 0;
  const reasons = [];
  const byParent = new Map();

  for (const node of targets) gatherFlattenBucketsFromNode(node, byParent, reasons);

  if (!byParent.size && explicitSelection.length) {
    for (const node of explicitSelection) {
      const blocked = getBlockedReason(node, 'flatten-vectors');
      if (blocked) {
        skipped++;
        if (reasons.length < 3 && !reasons.includes(blocked)) reasons.push(blocked);
      }
    }
  }

  for (const bucket of byParent.values()) {
    const uniqueMap = new Map();
    for (const n of bucket.nodes) uniqueMap.set(n.id, n);
    const uniqueNodes = Array.from(uniqueMap.values());
    if (uniqueNodes.length < 2) continue;
    try {
      figma.flatten(uniqueNodes, bucket.parent);
      changed += uniqueNodes.length;
    } catch (e) {
      skipped += uniqueNodes.length;
      if (reasons.length < 3) reasons.push(e && e.message ? e.message : 'Flatten failed.');
    }
  }

  if (!changed && !skipped) reasons.push('No flattenable vector groups were found. Select an icon or logo group with multiple direct vector children.');
  return { changed, skipped, reasons };
}

function copyVisualStyle(sourceNode, targetNode) {
  try {
    if ('fills' in sourceNode && 'fills' in targetNode && sourceNode.fills !== figma.mixed) targetNode.fills = JSON.parse(JSON.stringify(sourceNode.fills));
    if ('strokes' in sourceNode && 'strokes' in targetNode && sourceNode.strokes !== figma.mixed) targetNode.strokes = JSON.parse(JSON.stringify(sourceNode.strokes));
    if ('strokeWeight' in sourceNode && 'strokeWeight' in targetNode) targetNode.strokeWeight = sourceNode.strokeWeight;
    if ('cornerRadius' in sourceNode && 'cornerRadius' in targetNode && typeof sourceNode.cornerRadius === 'number') targetNode.cornerRadius = sourceNode.cornerRadius;
    if ('opacity' in sourceNode && 'opacity' in targetNode) targetNode.opacity = sourceNode.opacity;
    if ('effects' in sourceNode && 'effects' in targetNode) targetNode.effects = JSON.parse(JSON.stringify(sourceNode.effects));
  } catch (e) {}
}

async function convertButtonsToAutoLayout() {
  const nodes = await getActionNodes(['button-no-auto-layout']);
  let changed = 0;
  let skipped = 0;
  const reasons = [];
  for (const node of nodes) {
    try {
      if (!isLikelyButton(node)) continue;
      const blocked = getBlockedReason(node, 'convert-buttons');
      if (blocked) {
        skipped++;
        if (reasons.length < 3) reasons.push(blocked);
        continue;
      }

      if ((node.type === 'FRAME' || node.type === 'COMPONENT') && node.layoutMode === 'NONE') {
        node.layoutMode = 'HORIZONTAL';
        node.primaryAxisSizingMode = 'AUTO';
        node.counterAxisSizingMode = 'AUTO';
        node.primaryAxisAlignItems = 'CENTER';
        node.counterAxisAlignItems = 'CENTER';
        node.itemSpacing = Math.max(node.itemSpacing || 8, 8);
        node.paddingLeft = Math.max(node.paddingLeft || 16, 16);
        node.paddingRight = Math.max(node.paddingRight || 16, 16);
        node.paddingTop = Math.max(node.paddingTop || 10, 10);
        node.paddingBottom = Math.max(node.paddingBottom || 10, 10);
        if ('strokesIncludedInLayout' in node) node.strokesIncludedInLayout = true;
        changed++;
        continue;
      }

      if (node.type === 'GROUP' && node.parent) {
        const frame = figma.createFrame();
        frame.name = node.name === 'Group' ? 'Button' : node.name;
        frame.layoutMode = 'HORIZONTAL';
        frame.primaryAxisSizingMode = 'AUTO';
        frame.counterAxisSizingMode = 'AUTO';
        frame.primaryAxisAlignItems = 'CENTER';
        frame.counterAxisAlignItems = 'CENTER';
        frame.itemSpacing = 8;
        frame.paddingLeft = 16;
        frame.paddingRight = 16;
        frame.paddingTop = 10;
        frame.paddingBottom = 10;
        frame.x = node.x;
        frame.y = node.y;
        const bgRect = node.children.find(c => c.type === 'RECTANGLE' && c.width >= node.width * 0.7 && c.height >= node.height * 0.7);
        if (bgRect) copyVisualStyle(bgRect, frame);
        node.parent.insertChild(node.parent.children.indexOf(node), frame);
        const movableChildren = node.children.slice().filter(c => c !== bgRect);
        for (const child of movableChildren) frame.appendChild(child);
        if (bgRect) {
          try { bgRect.remove(); } catch (e) {}
        }
        try { node.remove(); } catch (e) {}
        changed++;
        continue;
      }

      skipped++;
      if (reasons.length < 3) reasons.push('This button structure is not supported for automatic conversion yet.');
    } catch (e) {
      skipped++;
      if (reasons.length < 3) reasons.push(e && e.message ? e.message : 'Button conversion failed.');
    }
  }
  return { changed, skipped, reasons };
}

async function outlineStrokesInSelection() {
  const roots = getScopeNodes();
  const entries = getAllNodes(roots);
  let changed = 0;
  let skipped = 0;
  const reasons = [];
  for (const { node } of entries) {
    if (!('strokes' in node) || node.strokes === figma.mixed || !Array.isArray(node.strokes) || node.strokes.length === 0) continue;
    const blocked = getBlockedReason(node, 'outline-strokes');
    if (blocked) {
      skipped++;
      if (reasons.length < 3) reasons.push(blocked);
      continue;
    }
    try {
      figma.outlineStroke([node]);
      changed++;
    } catch (e) {
      skipped++;
      if (reasons.length < 3) reasons.push(e && e.message ? e.message : 'Outline stroke failed.');
    }
  }
  return { changed, skipped, reasons };
}

async function makeSectionsAutoLayout() {
  const explicitSelection = figma.currentPage.selection.length ? figma.currentPage.selection.slice() : [];
  let nodes = [];

  const seen = new Set();
  const pushNode = (node) => {
    if (!node || seen.has(node.id)) return;
    seen.add(node.id);
    nodes.push(node);
  };

  if (explicitSelection.length) {
    for (const root of explicitSelection) {
      if (['FRAME', 'GROUP', 'COMPONENT'].includes(root.type)) {
        if (!isAutoLayoutFrame(root) && shouldTreatAsSection(root)) pushNode(root);
      }
      const descendants = getAllNodes([root]).map(x => x.node);
      for (const node of descendants) {
        if (!['FRAME', 'GROUP', 'COMPONENT'].includes(node.type)) continue;
        if (node.id === root.id) continue;
        if (isAutoLayoutFrame(node)) continue;
        if (shouldTreatAsSection(node)) pushNode(node);
      }
    }
  } else {
    nodes = await getActionNodes(['section-no-auto-layout']);
  }

  let changed = 0;
  let skipped = 0;
  const reasons = [];
  const axisSummary = { HORIZONTAL: 0, VERTICAL: 0 };

  for (const node of nodes) {
    const blocked = getBlockedReason(node, 'section-auto-layout');
    if (blocked) {
      skipped++;
      if (reasons.length < 3 && !reasons.includes(blocked)) reasons.push(blocked);
      continue;
    }

    try {
      if ((node.type === 'FRAME' || node.type === 'COMPONENT') && node.layoutMode === 'NONE') {
        const axis = applySmartAutoLayout(node);
        axisSummary[axis] = (axisSummary[axis] || 0) + 1;
        changed++;
        continue;
      }

      if (node.type === 'GROUP' && node.parent) {
        const frame = figma.createFrame();
        frame.name = node.name;
        frame.x = node.x;
        frame.y = node.y;
        frame.resizeWithoutConstraints(node.width, node.height);
        node.parent.insertChild(node.parent.children.indexOf(node), frame);
        const children = node.children.slice();
        for (const child of children) frame.appendChild(child);
        const axis = applySmartAutoLayout(frame);
        axisSummary[axis] = (axisSummary[axis] || 0) + 1;
        try { node.remove(); } catch (e) {}
        changed++;
        continue;
      }

      skipped++;
      if (reasons.length < 3 && !reasons.includes('This selected layer type cannot be converted automatically.')) reasons.push('This selected layer type cannot be converted automatically.');
    } catch (e) {
      skipped++;
      if (reasons.length < 3) reasons.push(e && e.message ? e.message : 'Section auto layout failed.');
    }
  }

  if (!nodes.length) reasons.push('Select a frame/component containing sections, or select the section frames directly, then run Make Auto Layout.');
  if (changed && (axisSummary.HORIZONTAL || axisSummary.VERTICAL)) {
    const parts = [];
    if (axisSummary.VERTICAL) parts.push(axisSummary.VERTICAL + ' vertical');
    if (axisSummary.HORIZONTAL) parts.push(axisSummary.HORIZONTAL + ' horizontal');
    reasons.unshift('Applied smart auto layout: ' + parts.join(', ') + '.');
  }
  return { changed, skipped, reasons };
}

function storeAudit(report) {
  lastAuditNodeIds = [];
  lastAuditIssueTypesByNode = new Map();
  for (const issue of report.issues) {
    if (!issue.nodeId) continue;
    if (!lastAuditIssueTypesByNode.has(issue.nodeId)) lastAuditIssueTypesByNode.set(issue.nodeId, []);
    lastAuditIssueTypesByNode.get(issue.nodeId).push(issue.type);
    lastAuditNodeIds.push(issue.nodeId);
  }
  lastAuditNodeIds = Array.from(new Set(lastAuditNodeIds));
}

function formatActionMessage(label, result) {
  let msg = `${label}: ${result.changed} changed`;
  if (result.skipped) msg += `, ${result.skipped} skipped`;
  if (result.reasons && result.reasons.length) msg += `. ${result.reasons[0]}`;
  return msg;
}

async function markReportData(extraMessage) {
  const report = await collectIssues();
  const selectedCount = figma.currentPage.selection.length;
  const topFramesOnPage = figma.currentPage.children.filter(n => ['FRAME', 'SECTION', 'COMPONENT_SET', 'COMPONENT'].includes(n.type)).length;
  report.scope = selectedCount ? 'selection' : 'page';
  if (!extraMessage && !selectedCount && topFramesOnPage > 1) {
    extraMessage = 'Tip: this page has multiple top-level frames/sections. Select the specific frame(s) you want before running Audit for a narrower report.';
  }
  storeAudit(report);
  figma.ui.postMessage({ type: 'report', report, extraMessage });
}

// ── Typography & Colors helpers ──────────────────────────────────────────
function rgbToHexStr(color) {
  const h = v => Math.round(v * 255).toString(16).padStart(2, '0');
  return ('#' + h(color.r) + h(color.g) + h(color.b)).toUpperCase();
}

function hexToHsl(hex) {
  const r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b), l = (max+min)/2;
  if (max === min) return [0, 0, l*100];
  const d = max - min, s = l > 0.5 ? d/(2-max-min) : d/(max+min);
  let hh;
  switch(max) {
    case r: hh = ((g-b)/d + (g<b?6:0))/6; break;
    case g: hh = ((b-r)/d + 2)/6; break;
    default: hh = ((r-g)/d + 4)/6;
  }
  return [hh*360, s*100, l*100];
}

function colorDist(hex1, hex2) {
  try {
    const [h1,s1,l1] = hexToHsl(hex1), [h2,s2,l2] = hexToHsl(hex2);
    const dh = Math.min(Math.abs(h1-h2), 360-Math.abs(h1-h2))/180;
    return Math.sqrt(dh*dh*0.5 + ((s1-s2)/100)**2*0.3 + ((l1-l2)/100)**2*0.2);
  } catch (e) { return 1; }
}

function relLum(hex) {
  const c = s => { const v=parseInt(s,16)/255; return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4; };
  return 0.2126*c(hex.slice(1,3))+0.7152*c(hex.slice(3,5))+0.0722*c(hex.slice(5,7));
}

function wcagContrast(hex1, hex2) {
  const l1=relLum(hex1), l2=relLum(hex2);
  return ((Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05));
}

async function collectTypographyAndColors() {
  const allNodes = [];
  function walkAll(node) {
    allNodes.push(node);
    if ('children' in node) { for (const c of node.children) walkAll(c); }
  }
  for (const child of figma.currentPage.children) walkAll(child);

  const colorStylesLocal = await figma.getLocalPaintStylesAsync();
  const textStylesLocal  = await figma.getLocalTextStylesAsync();

  const colorStyleUsage = new Map();
  const textStyleUsage  = new Map();
  const localColorMap   = new Map();
  const localTextMap    = new Map();

  for (const node of allNodes) {
    if (node.visible === false) continue;

    if ('fills' in node && node.fills !== figma.mixed && Array.isArray(node.fills)) {
      const fsId = 'fillStyleId' in node ? node.fillStyleId : '';
      const linked = typeof fsId === 'string' && fsId.length > 0 && fsId !== figma.mixed;
      for (const fill of node.fills) {
        if (!fill || fill.visible === false || fill.type !== 'SOLID') continue;
        if (linked) {
          colorStyleUsage.set(fsId, (colorStyleUsage.get(fsId)||0)+1);
        } else {
          const hex = rgbToHexStr(fill.color);
          const op  = typeof fill.opacity === 'number' ? fill.opacity : 1;
          const key = hex + '|' + Math.round(op*100);
          if (!localColorMap.has(key)) localColorMap.set(key, { hex, opacity: op, count: 0, exNodes: [] });
          const e = localColorMap.get(key);
          e.count++;
          if (e.exNodes.length < 3) e.exNodes.push({ id: node.id, name: node.name });
        }
      }
    }

    if (node.type === 'TEXT') {
      const tsId = 'textStyleId' in node ? node.textStyleId : '';
      const linked = typeof tsId === 'string' && tsId.length > 0 && tsId !== figma.mixed;
      if (linked) {
        textStyleUsage.set(tsId, (textStyleUsage.get(tsId)||0)+1);
      } else {
        const fn = node.fontName !== figma.mixed ? node.fontName : { family:'(mixed)', style:'' };
        const fs = node.fontSize !== figma.mixed ? Math.round(node.fontSize) : 0;
        const lh = node.lineHeight !== figma.mixed ? node.lineHeight : { unit:'AUTO' };
        const key = fn.family+'||'+fn.style+'||'+fs+'||'+(lh.unit==='PIXELS'?Math.round(lh.value):lh.unit);
        if (!localTextMap.has(key)) localTextMap.set(key, { fontFamily:fn.family, fontStyle:fn.style, fontSize:fs, lineHeight:lh, count:0, exNodes:[] });
        const e = localTextMap.get(key);
        e.count++;
        if (e.exNodes.length < 3) e.exNodes.push({ id:node.id, name:node.name, text:(node.characters||'').slice(0,40) });
      }
    }
  }

  // Build color styles data
  const colorStylesData = colorStylesLocal.map(s => {
    const p = s.paints.find(p => p.type==='SOLID' && p.visible!==false);
    const hex = p ? rgbToHexStr(p.color) : '#CCCCCC';
    const op  = p ? (typeof p.opacity==='number' ? p.opacity : 1) : 1;
    const usageCount = colorStyleUsage.get(s.id)||0;
    let cw = null, cb = null;
    try { cw = parseFloat(wcagContrast(hex,'#FFFFFF').toFixed(2)); } catch(e) {}
    try { cb = parseFloat(wcagContrast(hex,'#000000').toFixed(2)); } catch(e) {}
    return { id:s.id, name:s.name, hex, opacity:op, usageCount, used:usageCount>0, contrastWhite:cw, contrastBlack:cb };
  });

  // Build text styles data
  const textStylesData = textStylesLocal.map(s => {
    const usageCount = textStyleUsage.get(s.id)||0;
    const lh = s.lineHeight;
    const ls = s.letterSpacing;
    const lhStr = !lh||lh.unit==='AUTO' ? 'Auto' : lh.unit==='PIXELS' ? Math.round(lh.value)+'px' : Math.round(lh.value)+'%';
    const lsStr = ls && ls.value !== 0 ? (ls.unit==='PIXELS'?ls.value.toFixed(1)+'px':ls.value.toFixed(1)+'%') : '0';
    return {
      id:s.id, name:s.name,
      fontFamily: s.fontName ? s.fontName.family : '',
      fontStyle:  s.fontName ? s.fontName.style  : '',
      fontSize: s.fontSize||0,
      lineHeightStr: lhStr, letterSpacing: lsStr,
      usageCount, used: usageCount>0
    };
  });

  // Near-duplicate colors (styles + top local)
  const topLocal = [...localColorMap.values()].sort((a,b)=>b.count-a.count).slice(0,40);
  const hexPool = [
    ...colorStylesData.map(s=>({ hex:s.hex, label:s.name, source:'style' })),
    ...topLocal.map(l=>({ hex:l.hex, label:'Local ('+l.count+'×)', source:'local' }))
  ].filter(x=>/^#[0-9A-Fa-f]{6}$/.test(x.hex));
  const nearDupeGroups = [];
  const usedIdx = new Set();
  for (let i=0; i<hexPool.length; i++) {
    if (usedIdx.has(i)) continue;
    const group=[hexPool[i]], gIdx=[i];
    for (let j=i+1; j<hexPool.length; j++) {
      if (usedIdx.has(j)) continue;
      if (colorDist(hexPool[i].hex, hexPool[j].hex) < 0.07) { group.push(hexPool[j]); gIdx.push(j); }
    }
    if (group.length > 1) { gIdx.forEach(x=>usedIdx.add(x)); nearDupeGroups.push(group); }
  }

  // Duplicate text styles (same core properties)
  const tsKeyMap = new Map();
  for (const s of textStylesData) {
    const key = s.fontFamily+'|'+s.fontStyle+'|'+s.fontSize+'|'+s.lineHeightStr;
    if (!tsKeyMap.has(key)) tsKeyMap.set(key, []);
    tsKeyMap.get(key).push(s.name);
  }
  const dupTextGroups = [...tsKeyMap.values()].filter(g=>g.length>1);

  // Font size frequency
  const sizeFreq = new Map();
  for (const node of allNodes) {
    if (node.type==='TEXT' && node.visible!==false && node.fontSize!==figma.mixed) {
      const sz = Math.round(node.fontSize);
      if (sz>0) sizeFreq.set(sz,(sizeFreq.get(sz)||0)+1);
    }
  }
  const typeSizeInfo = [...sizeFreq.entries()].map(([size,count])=>({size,count})).sort((a,b)=>b.size-a.size);

  // Font families
  const famMap = new Map();
  for (const node of allNodes) {
    if (node.type==='TEXT' && node.visible!==false && node.fontName!==figma.mixed) {
      const fam = node.fontName.family;
      if (!famMap.has(fam)) famMap.set(fam,{ family:fam, styles:new Set(), count:0 });
      const e = famMap.get(fam);
      e.styles.add(node.fontName.style);
      e.count++;
    }
  }
  const fontFamilies = [...famMap.values()].map(f=>({ family:f.family, styles:[...f.styles].sort(), count:f.count })).sort((a,b)=>b.count-a.count);

  const unusedColorStyles = colorStylesData.filter(s=>!s.used);
  const unusedTextStyles  = textStylesData.filter(s=>!s.used);
  const localColorList = [...localColorMap.values()].sort((a,b)=>b.count-a.count);
  const localTextList  = [...localTextMap.values()].sort((a,b)=>b.count-a.count);

  const summary = {
    totalColorStyles: colorStylesData.length,
    unusedColorStyles: unusedColorStyles.length,
    localColorVariants: localColorList.length,
    totalLocalColorUses: localColorList.reduce((s,v)=>s+v.count,0),
    nearDupeColorGroups: nearDupeGroups.length,
    totalTextStyles: textStylesData.length,
    unusedTextStyles: unusedTextStyles.length,
    localTextVariants: localTextList.length,
    totalLocalTextUses: localTextList.reduce((s,v)=>s+v.count,0),
    duplicateTextGroups: dupTextGroups.length
  };
  const payload = {
    colorStyles: colorStylesData, localColors: localColorList,
    nearDupeColorGroups: nearDupeGroups, unusedColorStyles,
    textStyles: textStylesData, localTextCombos: localTextList,
    duplicateTextGroups: dupTextGroups, unusedTextStyles,
    typeSizeInfo, fontFamilies, summary
  };
  payload.textStyleGroups  = groupTextStyles(textStylesData);
  payload.recommendations  = buildRecommendations(payload);
  payload.opportunities    = buildOpportunities(payload);
  return payload;
}

// ── Smart text-style grouping ────────────────────────────────────────────
const TEXT_GROUPS = [
  { key:'display',    label:'Display & Hero',   rx:/\b(display|hero|banner|jumbo|mega|super)\b/i },
  { key:'heading',    label:'Headings',          rx:/\b(h[1-6]\b|heading\s*[1-6]?|headline|title)\b/i },
  { key:'subheading', label:'Subheadings',       rx:/\b(sub.?head|subtitle|section.?title)\b/i },
  { key:'body',       label:'Body Text',         rx:/\b(body|paragraph|p[1-3]|content|copy)\b/i },
  { key:'caption',    label:'Captions & Labels', rx:/\b(caption|small|footnote|label|hint|helper|detail|supporting|eyebrow|overline)\b/i },
  { key:'button',     label:'Buttons & CTAs',    rx:/\b(button|btn|cta|action)\b/i },
  { key:'ui',         label:'UI & Utility',      rx:/\b(nav|menu|chip|tag|badge|tooltip)\b/i },
];

function groupTextStyles(textStyles) {
  const groups = {};
  const unclassified = [];
  for (const style of textStyles) {
    let matched = false;
    for (const g of TEXT_GROUPS) {
      if (g.rx.test(style.name)) {
        if (!groups[g.key]) groups[g.key] = { key:g.key, label:g.label, styles:[] };
        groups[g.key].styles.push(style);
        matched = true; break;
      }
    }
    if (!matched) unclassified.push(style);
  }
  const result = Object.values(groups);
  if (unclassified.length > 0) result.push({ key:'other', label:'Other Styles', styles:unclassified });
  return result;
}

function buildRecommendations(d) {
  const recs = [];
  if (d.nearDupeColorGroups.length > 0) {
    const cnt = d.nearDupeColorGroups.reduce(function(s,g) { return s+g.length; }, 0);
    recs.push({ id:'near-dupe-colors', sev:'high',
      issue: cnt+' similar color'+(cnt>1?'s':'')+' across '+d.nearDupeColorGroups.length+' group'+(d.nearDupeColorGroups.length>1?'s':'')+' detected.',
      impact: 'Visual inconsistency in the design and harder maintenance during global color updates.',
      action: 'Merge each group into a single shared Color Style (e.g. "Gray/500", "Brand/Primary").',
      benefit: 'Reduces inconsistency — global color changes become a single update.' });
  }
  if (d.localColors.length > 0) {
    const total = d.summary.totalLocalColorUses;
    const hp = d.localColors.filter(function(c) { return c.count>=3; }).length;
    recs.push({ id:'unassigned-colors', sev: d.localColors.length>5 ? 'high' : 'medium',
      issue: d.localColors.length+' color'+(d.localColors.length>1?'s':'')+' applied on '+total+' layer'+(total>1?'s':'')+' without Color Styles.',
      impact: 'Cannot update these colors globally — each layer must be changed individually.',
      action: 'Create Color Styles for the '+(hp||d.localColors.length)+' most-used color'+((hp||d.localColors.length)>1?'s':'')+' and link all matching layers.',
      benefit: 'Enables global color updates and improves design system coverage.' });
  }
  if (d.duplicateTextGroups.length > 0) {
    const total = d.duplicateTextGroups.reduce(function(s,g) { return s+g.length; }, 0);
    recs.push({ id:'duplicate-text', sev:'medium',
      issue: total+' text style'+(total>1?'s':'')+' share identical properties across '+d.duplicateTextGroups.length+' group'+(d.duplicateTextGroups.length>1?'s':'')+' — this creates redundancy.',
      impact: 'Redundant styles clutter the library and lead to inconsistent usage by designers.',
      action: 'Merge each group into a single canonical style and update all references.',
      benefit: 'Cleaner typography system and easier maintenance.' });
  }
  if (d.localTextCombos.length > 0) {
    const total = d.summary.totalLocalTextUses;
    const hp = d.localTextCombos.filter(function(c) { return c.count>=3; }).length;
    recs.push({ id:'unassigned-text', sev: hp>0 ? 'high' : 'medium',
      issue: d.localTextCombos.length+' text combination'+(d.localTextCombos.length>1?'s':'')+' found on '+total+' layer'+(total>1?'s':'')+' without Text Styles.',
      impact: 'Typography changes require manually updating every individual text layer.',
      action: 'Start with the '+(hp||d.localTextCombos.length)+' combination'+((hp||d.localTextCombos.length)>1?'s':'')+' used 3+ times — create Text Styles and link them.',
      benefit: 'Enables global typography updates and speeds up developer handoff.' });
  }
  if (d.unusedColorStyles.length > 0 || d.unusedTextStyles.length > 0) {
    const total = d.unusedColorStyles.length + d.unusedTextStyles.length;
    recs.push({ id:'unused-styles', sev:'low',
      issue: total+' style'+(total>1?' are':' is')+' defined but not used on this page ('+d.unusedColorStyles.length+' color, '+d.unusedTextStyles.length+' text).',
      impact: 'Unused styles clutter the library and may confuse developers during handoff.',
      action: 'Remove styles not needed, or move them to an "Archive" page if reuse is possible.',
      benefit: 'Cleaner style library and simpler handoff documentation.' });
  }
  if (d.fontFamilies.length > 2) {
    recs.push({ id:'many-fonts', sev:'medium',
      issue: d.fontFamilies.length+' font families detected in this file.',
      impact: 'Multiple font families increase page load time and can create visual inconsistency.',
      action: 'Aim for 1–2 primary families. Identify and consolidate any one-off or decorative fonts.',
      benefit: 'Faster page load and more cohesive, intentional typography.' });
  }
  return recs;
}

function buildOpportunities(d) {
  const ops = [];
  d.nearDupeColorGroups.forEach(function(g) {
    const hexes = g.map(function(c) { return c.hex; }).slice(0,2).join(', ')+(g.length>2?'…':'');
    ops.push({ p:1, text:'Merge '+g.length+' similar colors ('+hexes+') into one Color Style.' });
  });
  d.duplicateTextGroups.forEach(function(g) {
    ops.push({ p:1, text:'Merge duplicate text styles: '+g.slice(0,2).join(', ')+(g.length>2?' + '+(g.length-2)+' more':'')+' into one.' });
  });
  const highColors = d.localColors.filter(function(c) { return c.count>=3; });
  if (highColors.length > 0) {
    ops.push({ p:2, text:'Create Color Styles for '+highColors.length+' frequently-used color'+(highColors.length>1?'s':'')+' (3+ uses each).' });
  }
  const highText = d.localTextCombos.filter(function(c) { return c.count>=3; });
  if (highText.length > 0) {
    ops.push({ p:2, text:'Convert '+highText.length+' unlinked text combination'+(highText.length>1?'s':'')+' into reusable Text Styles.' });
  }
  const unused = d.unusedColorStyles.length + d.unusedTextStyles.length;
  if (unused > 0) {
    ops.push({ p:3, text:'Remove '+unused+' unused style'+(unused>1?'s':'')+' ('+d.unusedColorStyles.length+' color, '+d.unusedTextStyles.length+' text).' });
  }
  if (d.fontFamilies.length > 2) {
    ops.push({ p:3, text:'Review '+d.fontFamilies.length+' font families — consolidate one-off fonts for consistency.' });
  }
  if (d.localColors.length > 0 && d.colorStyles.length === 0) {
    ops.unshift({ p:1, text:'No Color Styles exist yet — create styles from the most-used colors to start your palette.' });
  }
  if (d.localTextCombos.length > 0 && d.textStyles.length === 0) {
    ops.unshift({ p:1, text:'No Text Styles exist yet — create styles from your most-used font combinations.' });
  }
  return ops;
}

figma.ui.onmessage = async (msg) => {
  try {
    if (msg.type === 'run-audit') {
      captureSelectionIds();
      figma.ui.postMessage({ type: 'busy', stage: 'Starting audit' });
      await markReportData();
      figma.ui.postMessage({ type: 'idle' });
      return;
    }
    if (msg.type === 'rename-generic') {
      captureSelectionIds();
      figma.ui.postMessage({ type: 'busy', stage: 'Renaming generic layers' });
      const result = await renameGenericLayers();
      const message = formatActionMessage('Rename generic layers', result);
      await markReportData(message);
      figma.ui.postMessage({ type: 'idle' });
      figma.notify(message, { timeout: 3000 });
      return;
    }
    if (msg.type === 'remove-hidden') {
      captureSelectionIds();
      figma.ui.postMessage({ type: 'busy', stage: 'Removing hidden layers' });
      const result = await removeHiddenLayers();
      const message = formatActionMessage('Remove hidden layers', result);
      await markReportData(message);
      figma.ui.postMessage({ type: 'idle' });
      figma.notify(message, { timeout: 3000 });
      return;
    }
    if (msg.type === 'add-export-settings') {
      captureSelectionIds();
      figma.ui.postMessage({ type: 'busy', stage: 'Marking exportable assets' });
      const result = await addExportSettings();
      const message = formatActionMessage('Mark exportable assets', result);
      await markReportData(message);
      figma.ui.postMessage({ type: 'idle' });
      figma.notify(message, { timeout: 3000 });
      return;
    }
    if (msg.type === 'flatten-vectors') {
      captureSelectionIds();
      figma.ui.postMessage({ type: 'busy', stage: 'Flattening vectors' });
      const result = await flattenSelectedVectorGroups();
      const message = formatActionMessage('Flatten vectors', result);
      await markReportData(message);
      figma.ui.postMessage({ type: 'idle' });
      figma.notify(message, { timeout: 3000 });
      return;
    }
    if (msg.type === 'convert-buttons') {
      captureSelectionIds();
      figma.ui.postMessage({ type: 'busy', stage: 'Converting buttons' });
      const result = await convertButtonsToAutoLayout();
      const message = formatActionMessage('Convert buttons', result);
      await markReportData(message);
      figma.ui.postMessage({ type: 'idle' });
      figma.notify(message, { timeout: 3000 });
      return;
    }
    if (msg.type === 'outline-strokes') {
      captureSelectionIds();
      figma.ui.postMessage({ type: 'busy', stage: 'Outlining strokes' });
      const result = await outlineStrokesInSelection();
      const message = formatActionMessage('Outline strokes', result);
      await markReportData(message);
      figma.ui.postMessage({ type: 'idle' });
      figma.notify(message, { timeout: 3000 });
      return;
    }
    if (msg.type === 'section-auto-layout') {
      captureSelectionIds();
      figma.ui.postMessage({ type: 'busy', stage: 'Making sections Auto Layout' });
      const result = await makeSectionsAutoLayout();
      const message = formatActionMessage('Make sections Auto Layout', result);
      await markReportData(message);
      figma.ui.postMessage({ type: 'idle' });
      figma.notify(message, { timeout: 3000 });
      return;
    }
    if (msg.type === 'focus-node') {
      captureSelectionIds();
      const node = await figma.getNodeByIdAsync(msg.nodeId);
      if (node && 'visible' in node) {
        figma.currentPage.selection = [node];
        figma.viewport.scrollAndZoomIntoView([node]);
      }
      return;
    }
    if (msg.type === 'ignore-issue') {
      captureSelectionIds();
      ignoredIssueKeys.add(`${msg.nodeId}:${msg.issueType}`);
      const report = await collectIssues();
      storeAudit(report);
      figma.ui.postMessage({ type: 'report', report, extraMessage: 'Issue ignored for this session.' });
      await restoreSelectionIds();
      return;
    }
    if (msg.type === 'clear-ignored') {
      captureSelectionIds();
      ignoredIssueKeys = new Set();
      const report = await collectIssues();
      storeAudit(report);
      figma.ui.postMessage({ type: 'report', report, extraMessage: 'Ignored issues cleared.' });
      await restoreSelectionIds();
      return;
    }
    if (msg.type === 'prompt-select-frame') {
      figma.notify('Click on a frame or component in the canvas to select it', { timeout: 3000 });
      return;
    }
    if (msg.type === 'collect-typo-colors') {
      figma.ui.postMessage({ type: 'typo-colors-busy' });
      try {
        const data = await collectTypographyAndColors();
        figma.ui.postMessage({ type: 'typo-colors-result', data });
      } catch (e) {
        figma.ui.postMessage({ type: 'typo-colors-error', message: e instanceof Error ? e.message : String(e) });
      }
      return;
    }
    if (msg.type === 'merge-color-group') {
      try {
        const hexes = msg.hexes || [];
        const name  = (msg.name || '').trim() || (hexes[0] || 'Merged Color');
        if (hexes.length === 0) return;
        const target = hexes[0];
        const tr = parseInt(target.slice(1,3),16)/255;
        const tg = parseInt(target.slice(3,5),16)/255;
        const tb = parseInt(target.slice(5,7),16)/255;
        const localStyles = await figma.getLocalPaintStylesAsync();
        let style = null;
        for (const s of localStyles) {
          const p = s.paints.find(function(p) { return p.type==='SOLID'; });
          if (p && hexes.includes(rgbToHexStr(p.color))) { style = s; break; }
        }
        if (!style) {
          style = figma.createPaintStyle();
        }
        style.name   = name;
        style.paints = [{ type:'SOLID', color:{ r:tr, g:tg, b:tb }, opacity:1 }];
        const allNodes = [];
        function walkMerge(node) { allNodes.push(node); if ('children' in node) { for (const c of node.children) walkMerge(c); } }
        for (const child of figma.currentPage.children) walkMerge(child);
        let updated = 0;
        for (const node of allNodes) {
          if (!('fills' in node) || node.fills === figma.mixed || !Array.isArray(node.fills)) continue;
          const fsId = 'fillStyleId' in node ? node.fillStyleId : '';
          if (typeof fsId === 'string' && fsId.length > 0 && fsId !== figma.mixed) continue;
          let matched = false;
          for (const fill of node.fills) {
            if (fill.type==='SOLID' && hexes.includes(rgbToHexStr(fill.color))) { matched=true; break; }
          }
          if (matched) { try { node.fillStyleId = style.id; updated++; } catch (e) {} }
        }
        figma.ui.postMessage({ type:'merge-color-done', name:style.name, updated, mergeId:msg.mergeId });
      } catch (e) {
        figma.ui.postMessage({ type:'merge-color-error', message:e instanceof Error?e.message:String(e), mergeId:msg.mergeId });
      }
      return;
    }
    if (msg.type === 'collect-texts') {
      const scopeNodes = getScopeNodes();
      const entries = getAllNodes(scopeNodes);
      const texts = [];
      const seen = new Set();
      for (const { node } of entries) {
        if (node.type === 'TEXT' && node.characters && node.characters.trim() && !seen.has(node.id)) {
          seen.add(node.id);
          texts.push({ id: node.id, text: node.characters, path: nodePath(node) });
        }
      }
      figma.ui.postMessage({ type: 'texts-collected', texts });
      return;
    }
    if (msg.type === 'close') {
      figma.closePlugin();
      return;
    }
  } catch (error) {
    figma.ui.postMessage({ type: 'idle' });
    figma.ui.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};

figma.ui.postMessage({ type: 'report', initial: true, report: { scope: 'page', stats: { checkedNodes: 0, genericNames: 0, hiddenLayers: 0, deepNesting: 0, missingTextStyles: 0, missingColorStyles: 0, buttonsWithoutAutoLayout: 0, sectionsWithoutAutoLayout: 0, missingExportSettings: 0, vectorsToFlatten: 0, masksFound: 0, lineObjects: 0, actionable: {} }, issues: [] } });

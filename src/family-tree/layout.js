/**
 * Hierarchical layout for parent→child links.
 * Spouse pairs are placed on the same rank when possible.
 *
 * @param {import('./model.js').FamilyTree} tree
 * @param {{ nodeWidth?: number, nodeHeight?: number, rankGap?: number, nodeGap?: number, padding?: number }} [opts]
 */
export function computeFamilyLayout(tree, opts = {}) {
  const nodeWidth = opts.nodeWidth ?? 168;
  const nodeHeight = opts.nodeHeight ?? 138;
  const rankGap = opts.rankGap ?? 64;
  const nodeGap = opts.nodeGap ?? 32;
  const padding = opts.padding ?? 28;

  const people = tree.people || [];
  const links = tree.links || [];
  if (people.length === 0) {
    return { width: 400, height: 300, nodes: [], edges: [], spouseEdges: [] };
  }

  const byId = new Map(people.map((p) => [p.id, p]));
  const parentOf = new Map(); // child -> parent ids
  const childrenOf = new Map(); // parent -> child ids
  const spouseOf = new Map(); // id -> partner id

  for (const link of links) {
    if (!byId.has(link.fromId) || !byId.has(link.toId)) continue;
    if (link.type === 'spouse') {
      spouseOf.set(link.fromId, link.toId);
      spouseOf.set(link.toId, link.fromId);
    } else {
      if (!parentOf.has(link.toId)) parentOf.set(link.toId, []);
      parentOf.get(link.toId).push(link.fromId);
      if (!childrenOf.has(link.fromId)) childrenOf.set(link.fromId, []);
      childrenOf.get(link.fromId).push(link.toId);
    }
  }

  /** Manual positions win when set */
  const manual = people.filter((p) => typeof p.x === 'number' && typeof p.y === 'number');
  if (manual.length === people.length) {
    const nodes = people.map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      width: nodeWidth,
      height: nodeHeight,
    }));
    const edges = parentEdges(links, nodes, nodeWidth, nodeHeight);
    const spouse = spouseEdges(links, nodes, nodeWidth, nodeHeight);
    const bounds = boundsWithEdges(nodes, edges, spouse, padding);
    return {
      width: bounds.width,
      height: bounds.height,
      nodes,
      edges,
      spouseEdges: spouse,
    };
  }

  const rank = new Map();
  const roots = people.filter((p) => !parentOf.has(p.id));
  const seed =
    (tree.rootPersonId && byId.has(tree.rootPersonId) && roots.find((p) => p.id === tree.rootPersonId)) ||
    roots[0] ||
    people[0];

  // BFS up then down from seed to assign ranks
  const visited = new Set();
  const queue = [{ id: seed.id, r: 0 }];
  while (queue.length) {
    const { id, r } = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    rank.set(id, r);

    for (const parentId of parentOf.get(id) || []) {
      if (!visited.has(parentId)) queue.push({ id: parentId, r: r - 1 });
    }
    for (const childId of childrenOf.get(id) || []) {
      if (!visited.has(childId)) queue.push({ id: childId, r: r + 1 });
    }
    const partner = spouseOf.get(id);
    if (partner && !visited.has(partner)) queue.push({ id: partner, r });
  }

  for (const p of people) {
    if (!rank.has(p.id)) rank.set(p.id, 0);
  }

  const minRank = Math.min(...rank.values());
  for (const [id, r] of rank) rank.set(id, r - minRank);

  /** @type {Map<number, string[]>} */
  const byRank = new Map();
  for (const p of people) {
    const r = rank.get(p.id) ?? 0;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r).push(p.id);
  }

  // Keep spouses adjacent within a rank
  for (const [, ids] of byRank) {
    ids.sort((a, b) => {
      const pa = spouseOf.get(a);
      const pb = spouseOf.get(b);
      if (pa === b) return -1;
      if (pb === a) return 1;
      return (byId.get(a)?.firstName || '').localeCompare(byId.get(b)?.firstName || '', 'uk');
    });
  }

  const ranks = [...byRank.keys()].sort((a, b) => a - b);
  /** @type {Map<string, { id: string, x: number, y: number, width: number, height: number }>} */
  const pos = new Map();

  let maxWidth = 0;
  for (const r of ranks) {
    const ids = byRank.get(r) || [];
    const rowWidth = ids.length * nodeWidth + Math.max(0, ids.length - 1) * nodeGap;
    maxWidth = Math.max(maxWidth, rowWidth);
  }

  for (const r of ranks) {
    const ids = byRank.get(r) || [];
    const rowWidth = ids.length * nodeWidth + Math.max(0, ids.length - 1) * nodeGap;
    let x = padding + (maxWidth - rowWidth) / 2;
    const y = padding + r * (nodeHeight + rankGap);
    for (const id of ids) {
      const person = byId.get(id);
      const useManual = person && typeof person.x === 'number' && typeof person.y === 'number';
      pos.set(id, {
        id,
        x: useManual ? person.x : x,
        y: useManual ? person.y : y,
        width: nodeWidth,
        height: nodeHeight,
      });
      x += nodeWidth + nodeGap;
    }
  }

  const nodes = [...pos.values()];
  const edges = parentEdges(links, nodes, nodeWidth, nodeHeight);
  const spouse = spouseEdges(links, nodes, nodeWidth, nodeHeight);
  const bounds = boundsWithEdges(nodes, edges, spouse, padding);

  return {
    width: bounds.width,
    height: bounds.height,
    nodes,
    edges,
    spouseEdges: spouse,
  };
}

/** Expand canvas so side-routed edges are not clipped by the SVG box. */
function boundsWithEdges(nodes, edges, spouseEdges, padding) {
  let maxX = 0;
  let maxY = 0;
  for (const n of nodes) {
    maxX = Math.max(maxX, n.x + n.width);
    maxY = Math.max(maxY, n.y + n.height);
  }
  const paths = [...edges, ...spouseEdges].map((e) => e.d).join(' ');
  const nums = paths.match(/-?\d+(\.\d+)?/g) || [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = Number(nums[i]);
    const y = Number(nums[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {
    width: Math.max(400, maxX) + padding,
    height: Math.max(300, maxY) + padding,
  };
}

function parentEdges(links, nodes, nodeWidth, nodeHeight) {
  const pos = new Map(nodes.map((n) => [n.id, n]));
  return links
    .filter((l) => l.type === 'parent')
    .map((l) => {
      const a = pos.get(l.fromId);
      const b = pos.get(l.toId);
      if (!a || !b) return null;
      return { id: l.id, d: softLinkPath(a, b, nodeWidth, nodeHeight) };
    })
    .filter(Boolean);
}

function spouseEdges(links, nodes, nodeWidth, nodeHeight) {
  const pos = new Map(nodes.map((n) => [n.id, n]));
  const seen = new Set();
  return links
    .filter((l) => l.type === 'spouse')
    .map((l) => {
      const key = [l.fromId, l.toId].sort().join(':');
      if (seen.has(key)) return null;
      seen.add(key);
      const a = pos.get(l.fromId);
      const b = pos.get(l.toId);
      if (!a || !b) return null;
      return { id: l.id, d: softLinkPath(a, b, nodeWidth, nodeHeight) };
    })
    .filter(Boolean);
}

/**
 * Smooth cubic curve between card edges (no hard 90° stairs / 45° diagonals).
 * Anchors sit on the facing sides of each card.
 */
function softLinkPath(a, b, nodeWidth, nodeHeight) {
  const [sideA, sideB] = pickFacingSides(a, b, nodeWidth, nodeHeight);
  const p1 = edgeAnchor(a, sideA, nodeWidth, nodeHeight);
  const p2 = edgeAnchor(b, sideB, nodeWidth, nodeHeight);

  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  const pull = Math.max(36, Math.min(140, dist * 0.42));

  const n1 = outwardNormal(sideA);
  const n2 = outwardNormal(sideB);

  const c1x = p1.x + n1.x * pull;
  const c1y = p1.y + n1.y * pull;
  const c2x = p2.x + n2.x * pull;
  const c2y = p2.y + n2.y * pull;

  return `M ${round(p1.x)} ${round(p1.y)} C ${round(c1x)} ${round(c1y)}, ${round(c2x)} ${round(c2y)}, ${round(p2.x)} ${round(p2.y)}`;
}

function pickFacingSides(a, b, nodeWidth, nodeHeight) {
  const acx = a.x + nodeWidth / 2;
  const acy = a.y + nodeHeight / 2;
  const bcx = b.x + nodeWidth / 2;
  const bcy = b.y + nodeHeight / 2;
  const dx = bcx - acx;
  const dy = bcy - acy;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // Mostly horizontal: side ↔ side
  if (absDx > absDy * 1.05) {
    return dx > 0 ? ['right', 'left'] : ['left', 'right'];
  }
  // Mostly vertical: bottom ↔ top
  if (absDy > absDx * 1.05) {
    return dy > 0 ? ['bottom', 'top'] : ['top', 'bottom'];
  }
  // Diagonal: prefer vertical for parent/child feel when there's vertical separation
  if (absDy >= absDx * 0.65) {
    return dy > 0 ? ['bottom', 'top'] : ['top', 'bottom'];
  }
  return dx > 0 ? ['right', 'left'] : ['left', 'right'];
}

function edgeAnchor(node, side, nodeWidth, nodeHeight) {
  const cx = node.x + nodeWidth / 2;
  const cy = node.y + nodeHeight / 2;
  switch (side) {
    case 'top':
      return { x: cx, y: node.y };
    case 'bottom':
      return { x: cx, y: node.y + nodeHeight };
    case 'left':
      return { x: node.x, y: cy };
    case 'right':
      return { x: node.x + nodeWidth, y: cy };
    default:
      return { x: cx, y: cy };
  }
}

function outwardNormal(side) {
  switch (side) {
    case 'top':
      return { x: 0, y: -1 };
    case 'bottom':
      return { x: 0, y: 1 };
    case 'left':
      return { x: -1, y: 0 };
    case 'right':
      return { x: 1, y: 0 };
    default:
      return { x: 0, y: 0 };
  }
}

function round(n) {
  return Math.round(n * 10) / 10;
}

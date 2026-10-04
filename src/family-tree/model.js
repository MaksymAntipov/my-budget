/** @typedef {'male' | 'female' | 'unspecified'} Gender */
/** @typedef {'self' | 'partner' | 'child' | 'parent' | 'other'} FamilyRole */
/** @typedef {'parent' | 'spouse'} LinkType */
/** @typedef {'unknown' | 'none' | 'ordered' | 'copy'} DocStatus */

/**
 * @typedef {object} FamilyPerson
 * @property {string} id
 * @property {string} firstName
 * @property {string} patronymic
 * @property {string} lastName
 * @property {string} maidenName
 * @property {Gender} gender
 * @property {FamilyRole} role
 * @property {string} birthDate
 * @property {string} deathDate
 * @property {string} birthPlace
 * @property {string} birthSettlement
 * @property {string} birthDistrict
 * @property {string} birthRegion
 * @property {string} birthPlaceHistorical
 * @property {string} deathPlace
 * @property {string} burialPlace
 * @property {string} marriageDate
 * @property {string} marriagePlace
 * @property {string} nameVariants
 * @property {DocStatus} docBirthStatus
 * @property {DocStatus} docMarriageStatus
 * @property {DocStatus} docDeathStatus
 * @property {string} docBirthAct
 * @property {string} docMarriageAct
 * @property {string} docDeathAct
 * @property {string} militaryDraftPlace
 * @property {string} militaryRank
 * @property {string} militaryUnit
 * @property {string} militaryNotes
 * @property {string} placeHypotheses
 * @property {boolean} dnaInterest
 * @property {string} dnaNotes
 * @property {string} notes
 * @property {number} [x]
 * @property {number} [y]
 */

/**
 * @typedef {object} FamilyLink
 * @property {string} id
 * @property {string} fromId
 * @property {string} toId
 * @property {LinkType} type
 */

/**
 * @typedef {object} FamilyTree
 * @property {FamilyPerson[]} people
 * @property {FamilyLink[]} links
 * @property {string | null} rootPersonId
 * @property {number} version
 */

export const FAMILY_TREE_VERSION = 2;

export const ROLE_LABELS = {
  self: 'Я',
  partner: 'Партнер',
  child: 'Дитина',
  parent: 'Батьки',
  other: 'Інше',
};

export const GENDER_LABELS = {
  male: 'Чоловік',
  female: 'Жінка',
  unspecified: 'Не вказано',
};

export const DOC_STATUS_LABELS = {
  unknown: 'Невідомо',
  none: 'Немає',
  ordered: 'Замовлено в РАЦС',
  copy: 'Є копія',
};

/** @returns {FamilyTree} */
export function emptyTree() {
  return {
    version: FAMILY_TREE_VERSION,
    people: [],
    links: [],
    rootPersonId: null,
  };
}

/** @param {unknown} value @returns {DocStatus} */
function normalizeDocStatus(value) {
  if (value === 'none' || value === 'ordered' || value === 'copy' || value === 'unknown') return value;
  return 'unknown';
}

/**
 * @param {Partial<FamilyPerson> & { id: string }} partial
 * @returns {FamilyPerson}
 */
export function createPerson(partial) {
  // Only migrate legacy birthPlace → settlement when settlement was never set
  // (undefined). Explicit '' must clear and must NOT resurrect from birthPlace.
  const birthSettlementRaw = partial.birthSettlement;
  let birthSettlement = birthSettlementRaw ?? '';
  const birthDistrict = partial.birthDistrict ?? '';
  const birthRegion = partial.birthRegion ?? '';
  const legacyPlace = partial.birthPlace || '';

  if (
    birthSettlementRaw === undefined &&
    !birthDistrict &&
    !birthRegion &&
    legacyPlace
  ) {
    birthSettlement = legacyPlace;
  }

  const birthPlace = [birthSettlement, birthDistrict, birthRegion].filter(Boolean).join(', ');

  return {
    id: partial.id,
    firstName: partial.firstName || '',
    patronymic: partial.patronymic || '',
    lastName: partial.lastName || '',
    maidenName: partial.maidenName || '',
    gender: partial.gender || 'unspecified',
    role: partial.role || 'other',
    birthDate: partial.birthDate || '',
    deathDate: partial.deathDate || '',
    birthPlace,
    birthSettlement,
    birthDistrict,
    birthRegion,
    birthPlaceHistorical: partial.birthPlaceHistorical || '',
    deathPlace: partial.deathPlace || '',
    burialPlace: partial.burialPlace || '',
    marriageDate: partial.marriageDate || '',
    marriagePlace: partial.marriagePlace || '',
    nameVariants: partial.nameVariants || '',
    docBirthStatus: normalizeDocStatus(partial.docBirthStatus),
    docMarriageStatus: normalizeDocStatus(partial.docMarriageStatus),
    docDeathStatus: normalizeDocStatus(partial.docDeathStatus),
    docBirthAct: partial.docBirthAct || '',
    docMarriageAct: partial.docMarriageAct || '',
    docDeathAct: partial.docDeathAct || '',
    militaryDraftPlace: partial.militaryDraftPlace || '',
    militaryRank: partial.militaryRank || '',
    militaryUnit: partial.militaryUnit || '',
    militaryNotes: partial.militaryNotes || '',
    placeHypotheses: partial.placeHypotheses || '',
    dnaInterest: Boolean(partial.dnaInterest),
    dnaNotes: partial.dnaNotes || '',
    notes: partial.notes || '',
    x: typeof partial.x === 'number' ? partial.x : undefined,
    y: typeof partial.y === 'number' ? partial.y : undefined,
  };
}

/**
 * Short place label for canvas cards.
 * @param {FamilyPerson} person
 * @returns {string}
 */
export function placeLabel(person) {
  if (person.birthSettlement) return person.birthSettlement;
  if (person.birthPlace) return person.birthPlace;
  return '';
}

/**
 * Full geography line for prompts.
 * @param {FamilyPerson} person
 * @returns {string}
 */
export function birthPlaceFull(person) {
  const parts = [person.birthSettlement, person.birthDistrict, person.birthRegion].filter(Boolean);
  if (parts.length) return parts.join(', ');
  return person.birthPlace || '';
}

/**
 * @param {unknown} raw
 * @returns {FamilyTree}
 */
export function normalizeTree(raw) {
  const base = emptyTree();
  if (!raw || typeof raw !== 'object') return base;

  const data = /** @type {Record<string, unknown>} */ (raw);
  const peopleIn = Array.isArray(data.people) ? data.people : [];
  const linksIn = Array.isArray(data.links) ? data.links : [];

  const people = peopleIn
    .filter((p) => p && typeof p === 'object' && /** @type {any} */ (p).id)
    .map((p) => createPerson(/** @type {any} */ (p)));

  const personIds = new Set(people.map((p) => p.id));

  const links = linksIn
    .filter((l) => l && typeof l === 'object')
    .map((l) => {
      const link = /** @type {any} */ (l);
      return {
        id: String(link.id || crypto.randomUUID()),
        fromId: String(link.fromId || ''),
        toId: String(link.toId || ''),
        type: link.type === 'spouse' ? 'spouse' : 'parent',
      };
    })
    .filter((l) => l.fromId && l.toId && personIds.has(l.fromId) && personIds.has(l.toId));

  let rootPersonId = data.rootPersonId ? String(data.rootPersonId) : null;
  if (rootPersonId && !personIds.has(rootPersonId)) rootPersonId = null;
  if (!rootPersonId) {
    const self = people.find((p) => p.role === 'self');
    rootPersonId = self ? self.id : people[0]?.id || null;
  }

  return {
    version: FAMILY_TREE_VERSION,
    people,
    links,
    rootPersonId,
  };
}

/**
 * Ensure a "self" card exists, seeded from the profile name.
 * @param {FamilyTree} tree
 * @param {{ name?: string, surname?: string }} profile
 * @returns {FamilyTree}
 */
export function ensureSelfPerson(tree, profile = {}) {
  const next = normalizeTree(tree);
  const existing = next.people.find((p) => p.role === 'self');
  if (existing) {
    if (!next.rootPersonId) next.rootPersonId = existing.id;
    return next;
  }

  const self = createPerson({
    id: crypto.randomUUID(),
    firstName: profile.name || '',
    lastName: profile.surname || '',
    role: 'self',
    gender: 'unspecified',
    x: 320,
    y: 280,
  });
  next.people.push(self);
  next.rootPersonId = self.id;
  return next;
}

/**
 * @param {FamilyPerson} person
 * @returns {string}
 */
export function displayName(person) {
  return [person.firstName, person.patronymic, person.lastName].filter(Boolean).join(' ') || 'Без імені';
}

/**
 * @param {FamilyPerson} person
 * @returns {string}
 */
export function yearsLabel(person) {
  const birth = extractYear(person.birthDate);
  const death = extractYear(person.deathDate);
  if (!birth && !death) return '';
  if (death) return `${birth || '?'}–${death}`;
  return birth ? `${birth}–` : '';
}

function extractYear(value) {
  if (!value) return '';
  const m = String(value).match(/^(\d{4})/);
  return m ? m[1] : '';
}

/**
 * @param {FamilyPerson} person
 * @returns {boolean}
 */
export function showsMaidenName(person) {
  return person.gender === 'female';
}

/**
 * Label relative to «Я» (self / root) for canvas cards.
 * @param {string} personId
 * @param {FamilyTree} tree
 * @returns {string}
 */
export function relationLabelToSelf(personId, tree) {
  const self =
    tree.people.find((p) => p.role === 'self') ||
    tree.people.find((p) => p.id === tree.rootPersonId) ||
    null;
  if (!self) return '';
  if (personId === self.id) return 'Я';

  const person = tree.people.find((p) => p.id === personId);
  if (!person) return '';

  const byGender = (male, female, neutral) => {
    if (person.gender === 'male') return male;
    if (person.gender === 'female') return female;
    return neutral;
  };

  const parentsOf = (id) =>
    tree.links.filter((l) => l.type === 'parent' && l.toId === id).map((l) => l.fromId);
  const childrenOf = (id) =>
    tree.links.filter((l) => l.type === 'parent' && l.fromId === id).map((l) => l.toId);
  const spousesOf = (id) =>
    tree.links
      .filter((l) => l.type === 'spouse' && (l.fromId === id || l.toId === id))
      .map((l) => (l.fromId === id ? l.toId : l.fromId));

  const myParents = parentsOf(self.id);
  const myChildren = childrenOf(self.id);
  const mySpouses = spousesOf(self.id);
  if (mySpouses.includes(personId)) {
    return byGender('Чоловік', 'Дружина', 'Партнер');
  }

  /** BFS distance walking only parent←child edges upward from `startId`. */
  const ancestorDist = (startId, targetId) => {
    const seen = new Set([startId]);
    /** @type {{ id: string, d: number }[]} */
    const q = [{ id: startId, d: 0 }];
    while (q.length) {
      const { id, d } = q.shift();
      for (const p of parentsOf(id)) {
        if (seen.has(p)) continue;
        if (p === targetId) return d + 1;
        seen.add(p);
        q.push({ id: p, d: d + 1 });
      }
    }
    return 0;
  };

  /** BFS distance walking only parent→child edges downward from `startId`. */
  const descendantDist = (startId, targetId) => {
    const seen = new Set([startId]);
    /** @type {{ id: string, d: number }[]} */
    const q = [{ id: startId, d: 0 }];
    while (q.length) {
      const { id, d } = q.shift();
      for (const c of childrenOf(id)) {
        if (seen.has(c)) continue;
        if (c === targetId) return d + 1;
        seen.add(c);
        q.push({ id: c, d: d + 1 });
      }
    }
    return 0;
  };

  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  const up = ancestorDist(self.id, personId);
  if (up === 1) return byGender('Батько', 'Мати', 'Батьки');
  if (up === 2) return byGender('Дідусь', 'Бабуся', 'Пращур');
  if (up >= 3) {
    const pra = 'пра'.repeat(up - 2);
    return byGender(cap(`${pra}дід`), cap(`${pra}бабуся`), cap(`${pra}щур`));
  }

  const down = descendantDist(self.id, personId);
  if (down === 1) return byGender('Син', 'Донька', 'Дитина');
  if (down === 2) return byGender('Онук', 'Онука', 'Онук/онука');
  if (down >= 3) {
    const pra = 'пра'.repeat(down - 2);
    return byGender(cap(`${pra}внук`), cap(`${pra}внучка`), cap(`${pra}внук`));
  }

  // Siblings — share at least one parent
  const myParentSet = new Set(myParents);
  const theirParents = parentsOf(personId);
  if (theirParents.some((p) => myParentSet.has(p))) {
    return byGender('Брат', 'Сестра', 'Брат/сестра');
  }

  // Parents-in-law (parents of spouse)
  for (const spouseId of mySpouses) {
    if (parentsOf(spouseId).includes(personId)) {
      return byGender('Тесть', 'Теща', 'Батьки партнера');
    }
  }

  // Children of spouse (step)
  for (const spouseId of mySpouses) {
    if (childrenOf(spouseId).includes(personId) && !myChildren.includes(personId)) {
      return byGender('Пасинок', 'Падчерка', 'Дитина партнера');
    }
  }

  // Sibling's child — nephew/niece
  for (const siblingId of tree.people.map((p) => p.id)) {
    if (siblingId === self.id || siblingId === personId) continue;
    const sibParents = parentsOf(siblingId);
    if (!sibParents.some((p) => myParentSet.has(p))) continue;
    if (childrenOf(siblingId).includes(personId)) {
      return byGender('Племінник', 'Племінниця', 'Племінник');
    }
  }

  // Aunt / uncle — sibling of a parent
  for (const parentId of myParents) {
    const parentParentSet = new Set(parentsOf(parentId));
    if (parentsOf(personId).some((p) => parentParentSet.has(p)) && personId !== parentId) {
      return byGender('Дядько', 'Тітка', 'Дядько/тітка');
    }
  }

  return 'Родич';
}

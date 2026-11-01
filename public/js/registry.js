/**
 * Реестр блоков: встроенные + блоки из расширений.
 * Блок расширения живёт в мире под id вида "ext:<idРасширения>:<idБлока>".
 */
import { BLOCKS } from './blocks.js';
import { normalizeRules } from './rules.js';

export function extBlockId(extId, blockId) {
  return `ext:${extId}:${blockId}`;
}

export function parseBlockId(id) {
  if (typeof id !== 'string') return { kind: 'none' };
  if (id.startsWith('ext:')) {
    const [, extId, ...rest] = id.split(':');
    return { kind: 'ext', extId, blockId: rest.join(':') };
  }
  return { kind: 'builtin', blockId: id };
}

export function normalizeExtBlocks(manifest) {
  const blocks = [];
  for (const raw of manifest?.blocks || []) {
    if (!raw || !raw.id) continue;
    const id = extBlockId(manifest.id, raw.id);
    const rules = normalizeRules({ [id]: raw.rules })[id] || [];
    blocks.push({
      id,
      extId: manifest.id,
      extBlockId: raw.id,
      extName: manifest.name,
      name: raw.name || raw.id,
      color: raw.color || '#9aa4b2',
      group: 'ext',
      style: Array.isArray(raw.pattern) ? 'pattern' : 'solid',
      pattern: Array.isArray(raw.pattern) ? raw.pattern : null,
      solid: raw.solid !== false,
      liquid: !!raw.liquid,
      climbable: !!raw.climbable,
      friction: Number.isFinite(raw.friction) ? raw.friction : 0.9,
      restitution: Number.isFinite(raw.restitution) ? raw.restitution : 0,
      extHooks: Array.isArray(raw.hooks) ? raw.hooks : [],
      desc: raw.desc || `Блок «${raw.name || raw.id}» из расширения «${manifest.name}»`,
      rules,
      source: 'ext',
    });
  }
  return blocks;
}

/**
 * @param {Array} manifests — манифесты загруженных расширений
 */
export function buildRegistry(manifests = []) {
  const map = Object.create(null);
  const list = [];
  for (const block of BLOCKS) {
    const def = { ...block, source: 'builtin' };
    map[def.id] = def;
    list.push(def);
  }
  for (const manifest of manifests) {
    for (const def of normalizeExtBlocks(manifest)) {
      if (map[def.id]) continue;
      map[def.id] = def;
      list.push(def);
    }
  }
  return {
    list,
    map,
    manifests,
    get(id) {
      return map[id] || null;
    },
    /** Внешний блок без установленного расширения: рисуем заглушку. */
    fallback(id) {
      const parsed = parseBlockId(id);
      return {
        id,
        name: id,
        color: '#ff00ff',
        group: 'ext',
        style: 'unknown',
        solid: false,
        rules: [],
        missing: true,
        extId: parsed.extId || null,
        desc: `Нет расширения «${parsed.extId || '?'}» — блок не работает`,
      };
    },
    has(id) {
      return !!map[id];
    },
  };
}

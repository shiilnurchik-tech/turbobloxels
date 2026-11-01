/**
 * «Книга правил»: редактор поведения блоков.
 * Показывает для каждого блока список правил «КОГДА … ЕСЛИ … ТО …».
 */
import { el, mount, clear } from '../dom.js';
import {
  TRIGGERS,
  CONDITIONS,
  ACTIONS,
  TRIGGER_MAP,
  CONDITION_MAP,
  ACTION_MAP,
  makeRule,
  describeRule,
} from '../rules.js';
import { POWERS, BLOCK_GROUPS } from '../blocks.js';

export function createRulebook({ level, registry, extActions = [], onChange = () => {} }) {
  const root = el('div', { class: 'ext-layout', style: { alignItems: 'start' } });
  const listBox = el('div', { class: 'card palette' });
  const editorBox = el('div', { class: 'card' });
  root.append(listBox, editorBox);

  let selected = (level.screens?.[0]?.cells || []).find(Boolean) || 'coin';

  const usage = () => {
    const counts = new Map();
    for (const screen of level.screens || []) {
      for (const id of screen.cells || []) {
        if (!id) continue;
        counts.set(id, (counts.get(id) || 0) + 1);
      }
    }
    return counts;
  };

  const rulesFor = (blockId) => {
    if (Array.isArray(level.rules?.[blockId])) return level.rules[blockId];
    const def = registry.get(blockId);
    return JSON.parse(JSON.stringify(def?.rules || []));
  };

  const isCustom = (blockId) => Array.isArray(level.rules?.[blockId]);

  const commitRules = (blockId, rules) => {
    level.rules = level.rules || {};
    level.rules[blockId] = rules;
    onChange();
  };

  function renderList() {
    const counts = usage();
    const placed = [...counts.keys()];
    const ordered = [
      ...placed.map((id) => registry.get(id)).filter(Boolean),
      ...registry.list.filter((def) => !counts.has(def.id)),
    ];

    const groups = new Map();
    for (const def of ordered) {
      const group = groups.get(def.group) || [];
      group.push(def);
      groups.set(def.group, group);
    }

    const nodes = [];
    for (const group of BLOCK_GROUPS) {
      const defs = groups.get(group.id);
      if (!defs || !defs.length) continue;
      nodes.push(
        el('div', { class: 'palette-group' },
          el('h4', {}, group.name),
          el(
            'div',
            { class: 'block-list' },
            defs.map((def) => {
              const rules = rulesFor(def.id);
              return el(
                'button',
                {
                  class: `block-row${selected === def.id ? ' active' : ''}`,
                  onclick: () => {
                    selected = def.id;
                    renderList();
                    renderEditor();
                  },
                },
                el('span', { class: 'chip', style: { background: def.color } }),
                el('span', {}, def.name),
                el('span', { class: 'cnt' }, counts.has(def.id) ? `${counts.get(def.id)} · ${rules.length} п.` : `${rules.length} п.`)
              );
            })
          )
        )
      );
    }
    mount(listBox, nodes);
  }

  function valueControl(def, current, onInput) {
    if (!def || def.value === 'none') return null;
    if (def.value === 'number') {
      return el('input', {
        class: 'input',
        type: 'number',
        min: def.min,
        max: def.max,
        step: 'any',
        value: current ?? def.def ?? 0,
        oninput: (event) => onInput(Number(event.target.value)),
        style: { maxWidth: '120px' },
      });
    }
    if (def.value === 'text') {
      return el('input', {
        class: 'input',
        value: current ?? def.def ?? '',
        maxLength: 120,
        oninput: (event) => onInput(event.target.value),
      });
    }
    if (def.value === 'color') {
      return el('input', {
        type: 'color',
        value: current ?? def.def ?? '#ffffff',
        oninput: (event) => onInput(event.target.value),
        style: { width: '46px', height: '34px', border: 'none', background: 'none' },
      });
    }
    if (def.value === 'select') {
      return el(
        'select',
        {
          class: 'select',
          onchange: (event) => onInput(event.target.value),
          style: { maxWidth: '160px' },
        },
        (def.options || []).map((option) => el('option', { value: option, selected: (current ?? def.def) === option }, option))
      );
    }
    if (def.value === 'power') {
      return el(
        'select',
        { class: 'select', onchange: (event) => onInput(event.target.value), style: { maxWidth: '200px' } },
        Object.values(POWERS).map((power) => el('option', { value: power.id, selected: current === power.id }, power.name))
      );
    }
    if (def.value === 'block') {
      return el(
        'select',
        { class: 'select', onchange: (event) => onInput(event.target.value), style: { maxWidth: '200px' } },
        el('option', { value: '' }, '— выбери блок —'),
        registry.list.map((block) => el('option', { value: block.id, selected: current === block.id }, block.name))
      );
    }
    if (def.value === 'extAction') {
      return el(
        'select',
        { class: 'select', onchange: (event) => onInput(event.target.value), style: { maxWidth: '240px' } },
        el('option', { value: '' }, '— действие расширения —'),
        extActions.map((action) => el('option', { value: action.value, selected: current === action.value }, action.label))
      );
    }
    return null;
  }

  function renderEditor() {
    const def = registry.get(selected);
    if (!def) {
      mount(editorBox, el('p', { class: 'muted' }, 'Выбери блок слева.'));
      return;
    }
    const rules = rulesFor(selected);

    const head = el(
      'div',
      { class: 'row wrap', style: { marginBottom: '12px' } },
      el('span', { class: 'chip', style: { background: def.color, width: '26px', height: '26px', borderRadius: '8px', display: 'inline-block' } }),
      el('h3', { style: { margin: 0 } }, `Правила блока «${def.name}»`),
      el('span', { class: 'badge ' + (isCustom(selected) ? 'green' : '') }, isCustom(selected) ? 'свои правила' : 'по умолчанию')
    );

    const actions = [];
    if (isCustom(selected)) {
      actions.push(
        el(
          'button',
          {
            class: 'btn btn-ghost btn-sm',
            onclick: () => {
              delete level.rules[selected];
              onChange();
              renderList();
              renderEditor();
            },
          },
          '↺ Вернуть стандартные'
        )
      );
    }
    actions.push(
      el(
        'button',
        {
          class: 'btn btn-sm',
          onclick: () => {
            const next = rules.concat([makeRule('enter')]);
            commitRules(selected, next);
            renderList();
            renderEditor();
          },
        },
        '+ Правило'
      )
    );

    const cards = rules.map((rule, index) => ruleCard(rule, index, rules, def));

    mount(
      editorBox,
      head,
      el('div', { class: 'rulebook' },
        cards.length ? cards : el('div', { class: 'empty' }, 'У блока нет правил. Он просто стоит на месте.'),
        el('div', { class: 'row', style: { gap: '8px' } }, actions)
      )
    );
  }

  function ruleCard(rule, index, rules, blockDef) {
    const summary = el('div', { class: 'rule-summary' });
    const refreshSummary = () => {
      const info = describeRule(rule, blockDef.name);
      summary.textContent = info.text;
    };

    const triggerSelect = el(
      'select',
      {
        class: 'select',
        onchange: (event) => {
          rule.trigger = event.target.value;
          commitRules(selected, rules);
          renderEditor();
        },
      },
      TRIGGERS.map((trigger) => el('option', { value: trigger.id, selected: rule.trigger === trigger.id }, trigger.label))
    );

    const triggerDef = TRIGGER_MAP[rule.trigger];
    const everyInput =
      triggerDef?.value === 'number'
        ? el('input', {
            class: 'input',
            type: 'number',
            min: triggerDef.min,
            max: triggerDef.max,
            step: 'any',
            value: rule.every ?? triggerDef.def,
            style: { maxWidth: '100px' },
            oninput: (event) => {
              rule.every = Number(event.target.value);
              commitRules(selected, rules);
              refreshSummary();
            },
          })
        : null;

    const condNodes = (rule.conditions || []).map((cond, condIndex) => {
      const condDef = CONDITION_MAP[cond.type];
      const valueNode = valueControl(
        condDef,
        cond.value,
        (value) => {
          cond.value = value;
          commitRules(selected, rules);
          refreshSummary();
        }
      );
      return el(
        'div',
        { class: 'rule-line' },
        el('span', { class: 'badge' }, condDef?.label || cond.type),
        valueNode,
        el(
          'button',
          {
            class: 'icon-btn',
            title: 'Убрать условие',
            onclick: () => {
              rule.conditions.splice(condIndex, 1);
              commitRules(selected, rules);
              renderEditor();
            },
          },
          '✕'
        )
      );
    });

    const condAdder = el(
      'select',
      {
        class: 'select',
        style: { maxWidth: '220px' },
        onchange: (event) => {
          const def = CONDITION_MAP[event.target.value];
          if (!def) return;
          rule.conditions = rule.conditions || [];
          rule.conditions.push({ type: def.id, value: def.def });
          commitRules(selected, rules);
          renderEditor();
        },
      },
      el('option', { value: '' }, '+ условие'),
      CONDITIONS.map((cond) => el('option', { value: cond.id }, cond.label))
    );

    const actionNodes = (rule.actions || []).map((action, actionIndex) => {
      const actionDef = ACTION_MAP[action.type];
      const valueNode = valueControl(actionDef, action.value, (value) => {
        action.value = value;
        commitRules(selected, rules);
        refreshSummary();
      });
      return el(
        'div',
        { class: 'rule-line' },
        el('span', { class: 'badge green' }, '→'),
        el(
          'select',
          {
            class: 'select',
            style: { maxWidth: '230px' },
            onchange: (event) => {
              const def = ACTION_MAP[event.target.value];
              action.type = def.id;
              action.value = def.def;
              commitRules(selected, rules);
              renderEditor();
            },
          },
          ACTIONS.map((def) => el('option', { value: def.id, selected: action.type === def.id }, def.label))
        ),
        valueNode,
        el(
          'button',
          {
            class: 'icon-btn',
            title: 'Убрать действие',
            onclick: () => {
              rule.actions.splice(actionIndex, 1);
              commitRules(selected, rules);
              renderEditor();
            },
          },
          '✕'
        )
      );
    });

    const actionAdder = el(
      'select',
      {
        class: 'select',
        style: { maxWidth: '220px' },
        onchange: (event) => {
          const def = ACTION_MAP[event.target.value];
          if (!def) return;
          rule.actions.push({ type: def.id, value: def.def });
          commitRules(selected, rules);
          renderEditor();
        },
      },
      el('option', { value: '' }, '+ действие'),
      ACTIONS.map((def) => el('option', { value: def.id }, def.label))
    );

    refreshSummary();

    return el(
      'div',
      { class: 'rule-card' },
      el(
        'div',
        { class: 'rule-line' },
        el('span', { class: 'rule-word' }, 'Когда'),
        triggerSelect,
        everyInput,
        el('div', { class: 'spacer' }),
        el(
          'button',
          {
            class: 'icon-btn',
            title: 'Удалить правило',
            onclick: () => {
              rules.splice(index, 1);
              commitRules(selected, rules);
              renderList();
              renderEditor();
            },
          },
          '🗑'
        )
      ),
      el('div', { class: 'rule-line' }, el('span', { class: 'rule-word' }, 'Если'), ...(condNodes.length ? [] : [el('span', { class: 'small dim' }, 'без условий')])),
      condNodes.length ? el('div', { class: 'rule-line' }, condNodes) : null,
      el('div', { class: 'rule-line' }, condAdder),
      el('div', { class: 'rule-word', style: { marginTop: '4px' } }, 'То'),
      el('div', { class: 'rule-actions-list' }, actionNodes),
      el('div', { class: 'rule-line' }, actionAdder),
      summary
    );
  }

  renderList();
  renderEditor();

  return {
    node: root,
    select(blockId) {
      selected = blockId;
      renderList();
      renderEditor();
    },
    refresh() {
      renderList();
      renderEditor();
    },
  };
}

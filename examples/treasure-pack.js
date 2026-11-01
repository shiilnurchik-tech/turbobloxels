// «Сокровища» — пример событий и команд TBX.*
TBX.define({
  id: 'treasure-pack',
  name: 'Сокровища',
  version: '1.0.0',
  description: 'Клад, аптечка и бомба-блок. Показывает команды TBX.*',

  blocks: [
    {
      id: 'treasure',
      name: 'Клад',
      color: '#ffd166',
      solid: false,
      rules: [{ trigger: 'enter', actions: [{ type: 'score', value: 25 }] }],
      on: {
        enter(ctx) {
          TBX.sound('gem');
          TBX.particles(ctx.x, ctx.y, '#ffd166', 14);
          TBX.message('Клад!');
          TBX.setBlock(ctx.x, ctx.y, null); // блок исчезает
        },
      },
    },
    {
      id: 'medkit',
      name: 'Аптечка',
      color: '#7cfc9a',
      solid: false,
      on: {
        enter(ctx) {
          TBX.heal(1);
          TBX.setBlock(ctx.x, ctx.y, null);
        },
      },
    },
    {
      id: 'bomb',
      name: 'Бомба-блок',
      color: '#ff6b6b',
      solid: true,
      damage: 1,
      on: {
        tick(ctx) {
          if (Math.random() < 0.02) TBX.particles(ctx.x, ctx.y, '#ff6b6b', 3);
        },
      },
    },
  ],
});

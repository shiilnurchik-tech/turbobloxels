// «Землетрясение» — пример своего действия для «Книги правил».
// После установки в правилах любого блока появится действие
// «действие расширения → quake-pack:quake».
TBX.action({
  id: 'quake',
  name: 'землетрясение',
  value: 'number',
  run(ctx, power) {
    TBX.message('Землетрясение!');
    TBX.sound('hit');
    for (let i = 0; i < 18; i++) {
      TBX.particles(ctx.x + Math.random() * 8 - 4, ctx.y - Math.random() * 4, '#ff9f43', 2);
    }
    TBX.damage(1);
  },
});

TBX.define({
  id: 'quake-pack',
  name: 'Землетрясение',
  version: '1.0.0',
  description: 'Блок-эпицентр и действие «землетрясение» для книги правил.',

  blocks: [
    {
      id: 'epicenter',
      name: 'Эпицентр',
      color: '#ff9f43',
      solid: true,
      rules: [
        {
          trigger: 'stomp',
          conditions: [],
          actions: [{ type: 'ext', value: 'quake-pack:quake' }],
        },
      ],
      on: {
        enter(ctx) {
          TBX.log('эпицентр на', ctx.x, ctx.y);
        },
      },
    },
  ],

  hooks: {
    onStart(ctx) {
      TBX.log('игра началась, сердец:', ctx.hearts);
    },
    onWin(ctx) {
      TBX.log('победа с очками', ctx.score);
    },
  },
});

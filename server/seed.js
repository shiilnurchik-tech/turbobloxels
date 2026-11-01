/**
 * Сид-данные: демо-уровень «Первый прыжок» и два примера расширений.
 * Заполняется один раз, если база пустая.
 * Сами данные лежат в public/js/seed-data.js — их же использует клиент
 * в локальном режиме (GitHub Pages без сервера).
 */
import { getDb, save } from './db.js';
import { hashPassword, newId } from './auth.js';
import { buildDemoLevelData, DEMO_TITLE, DEMO_DESCRIPTION, EXAMPLE_EXTENSIONS } from '../public/js/seed-data.js';

export function seedIfEmpty() {
  const db = getDb();
  if (db.levels.length > 0 || db.extensions.length > 0) return false;

  const systemUser = {
    id: newId('u_'),
    name: 'TurboBloxels',
    passHash: hashPassword(newId('nologin')),
    createdAt: Date.now(),
  };
  db.users.push(systemUser);

  db.levels.push({
    id: newId('l_'),
    ownerId: systemUser.id,
    ownerName: systemUser.name,
    title: DEMO_TITLE,
    description: DEMO_DESCRIPTION,
    data: buildDemoLevelData(),
    extensionIds: [],
    thumb: null,
    published: true,
    plays: 0,
    likes: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  for (const example of EXAMPLE_EXTENSIONS) {
    db.extensions.push({
      id: example.id,
      ownerId: systemUser.id,
      ownerName: systemUser.name,
      name: example.name,
      version: example.version,
      description: example.description,
      source: example.source,
      blocks: example.blocks,
      likes: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  save();
  return true;
}

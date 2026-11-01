import { el, modal, toast } from '../dom.js';
import { login, register } from '../store.js';

/** Модалка входа/регистрации. Возвращает Promise<boolean>. */
export function authModal() {
  return new Promise((resolve) => {
    let mode = 'login';
    let done = false;

    const nameInput = el('input', {
      class: 'input',
      placeholder: 'Имя игрока',
      maxLength: 24,
      autocomplete: 'username',
      value: '',
    });
    const passInput = el('input', {
      class: 'input',
      type: 'password',
      placeholder: 'Пароль',
      maxLength: 200,
      autocomplete: 'current-password',
    });
    const error = el('p', { class: 'small', style: { color: 'var(--red)', minHeight: '18px', margin: '4px 0 0' } });
    const title = el('h3', {}, '');
    const submit = el('button', { class: 'btn btn-block', type: 'submit' }, 'Войти');
    const switcher = el('button', {
      class: 'btn btn-ghost btn-block btn-sm',
      type: 'button',
      onclick: () => {
        mode = mode === 'login' ? 'register' : 'login';
        sync();
      },
    });

    function sync() {
      title.textContent = mode === 'login' ? 'Вход' : 'Регистрация';
      submit.textContent = mode === 'login' ? 'Войти' : 'Создать аккаунт';
      switcher.textContent = mode === 'login' ? 'У меня нет аккаунта' : 'У меня уже есть аккаунт';
      passInput.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
      error.textContent = '';
    }
    sync();

    const form = el(
      'form',
      {
        onsubmit: async (event) => {
          event.preventDefault();
          error.textContent = '';
          submit.disabled = true;
          try {
            const name = nameInput.value.trim();
            const password = passInput.value;
            if (mode === 'login') await login(name, password);
            else await register(name, password);
            toast(`Привет, ${name}!`, 'success');
            done = true;
            dlg.close();
            resolve(true);
          } catch (err) {
            error.textContent = err.message;
          } finally {
            submit.disabled = false;
          }
        },
      },
      title,
      el('label', { class: 'field' }, el('span', {}, 'Имя'), nameInput),
      el('label', { class: 'field' }, el('span', {}, 'Пароль'), passInput),
      error,
      submit,
      el('div', { style: { height: '10px' } }),
      switcher
    );

    const dlg = modal({
      title: 'Аккаунт TurboBloxels',
      onClose: () => {
        if (!done) resolve(false);
      },
      body: el(
        'div',
        {},
        el('p', { class: 'small muted' }, 'Аккаунт нужен, чтобы публиковать уровни и расширения. Играть можно и без него.'),
        form
      ),
    });

    setTimeout(() => nameInput.focus(), 60);
  });
}

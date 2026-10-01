# Экзамен для агента — 10 типовых ошибок

Зачем: проверить, что модель (Haiku, Sonnet, Opus, Gemini, GPT) держит правила кита, а не только читает их.
Как: `python3 kit/tools/cosmos.py quiz` печатает фрагменты без ответов — дать их модели с просьбой «в каждом фрагменте назови
ошибку, код правила и правку в одну строку». Сверить с разделом «Ответы» (`quiz --key`). Проходной балл — 9 из 10.
Механическую часть линтер проверяет сам: `python3 kit/tools/cosmos.py quiz --check` (входит в `selftest.sh`).

## 1. Секция с двумя действиями

```html
<section class="section"><div class="section-head"><h2>Сайт за вечер</h2></div>
  <div class="btn-row row-center"><a class="btn primary" href="#start">Начать</a><a class="btn primary" href="#demo">Посмотреть демо</a></div>
</section>
```

## 2. Удаление в ряду кнопок

```html
<div class="btn-row"><button class="btn" type="button">Переименовать</button><button class="btn solid danger" type="button">Удалить</button></div>
```

## 3. Свои стили

```css
.promo { color: #fff; background: rgba(255, 255, 255, .06); transition: color .25s; }
@keyframes blink { from { opacity: 0 } to { opacity: 1 } }
```

## 4. Сообщение после сохранения

```html
<form class="form-grid"><label>Имя <input class="in" name="name"></label>
  <div class="form-actions" style="margin-top: 24px"><button class="btn primary" type="submit">Сохранить</button></div></form>
<script>document.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); alert('Сохранено'); });</script>
```

## 5. Спрятать панель до первого результата

```html
<div class="panel empty" id="results"></div>
```

## 6. Ряд фильтров

```html
<div class="btn-row"><select class="in" aria-label="Жанр"><option>Все</option><option>Фантастика</option></select><button class="btn small" type="button">Применить</button></div>
```

## 7. Поле без кольца фокуса

```css
.search-box input { outline: none; border: 0; background: transparent; }
```

## 8. Тексты героя

```html
<h2>Какой результат вы получите?</h2>
<button class="btn" type="button">Бесшовный опыт</button>
```

## 9. Текущий шаг мастера

```css
.my-steps .step.on .n { background: var(--ink); color: var(--ink); }
```

## 10. Инкогнито в чате

```js
inc.addEventListener('change', () => {
  empty.querySelector('p').textContent = inc.checked ? 'Ничего не запомню.' : 'Я вижу ваши отзывы, анкету и память о вкусе. Советую книги рядом и «мосты» в другие жанры.';
});
```
```css
.chat-main.blank .chat-scroll { display: flex; align-items: flex-end; }
```

## Ответы

| № | коды | правка |
|---|---|---|
| 1 | H1 | одна `.btn.primary` на секцию: вторая — `.btn` |
| 2 | H3 | красная плита только в `<dialog>` подтверждения; в ряду — `.btn` «Удалить…», обратимое — без подтверждения, «Отменить» в тосте |
| 3 | S1, S3 | `#fff` → `var(--ink)`, `rgba(…)` → `var(--surface)`, `.25s` → `var(--t-fast)`; `@keyframes` убрать — движение даёт кит (`enter`/`exit`) |
| 4 | S6, J1 | `style="margin-top: 24px"` → класс в `site.css`; `alert()` → `site.toast('ok', 'Сохранено')` |
| 5 | H11 | `.empty` — блок пустого состояния кита; спрятать — `hidden`, панель результата не рисовать до первого результата |
| 6 | H12 | `<select class="in auto">` — по ширине содержимого, иначе растянется на всю колонку |
| 7 | S9 | кольцо снимать только у поля внутри контейнера и дать контейнеру `:focus-within { border-color: var(--line-3) }` |
| 8 | T2, T1 | заголовок-утверждение («Сайт за вечер»); кнопка называет результат («Создать плейлист»), клише убрать |
| 9 | S10 (B11) | на заливке `--ink` текст — `color: var(--bg)`; активный шаг отличает плашка, а не заливка цвета цифры |
| 10 | B12 (глазами) | смена текста двигает пустое состояние вверх-вниз: зарезервировать место — `min-height` у `.chat-empty`, заголовок прижат к верху, подсказки к низу |

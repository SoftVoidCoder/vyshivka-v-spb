const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const PHONE = '8 800 555-91-55';

/* Вышивка в пяльцах. Из контуров в SVG строится программа машины: подклад, гладь,
   протяжки, обрезка, смена нити. Стежки рисуются на canvas по одному. */
(() => {
  const fig = $('.hoop');
  if (!fig) return;
  const [base, over] = $$('canvas', fig).map(c => c.getContext('2d'));
  const needle = $('.needle', fig), bar = $('[data-bar]', fig), foot = $('[data-foot]', fig);
  const threadPath = $('[data-thread]', fig), swatch = $('[data-swatch]', fig);
  const threadName = $('[data-thread-name]', fig), counter = $('[data-count]', fig), replay = $('[data-replay]', fig);
  const fmt = n => n.toLocaleString('ru-RU');

  const THREADS = {
    white: { name: 'Белая нить', base: '#e4e2da', under: '#9f9d95', hl: 0.75 },
    red: { name: 'Красная нить', base: '#c42a1f', under: '#7e1912', hl: 0.32 },
  };
  const MS = { run: 18, under: 10, satin: 9, leaf: 12, jump: 400, move: 500, trim: 450, color: 800 }; // длительность события
  const W = { run: 1.7, under: 1.1, satin: 2.1, leaf: 1.6 }; // толщина нити
  const PARK = { x: 200, y: 48 };

  // ломаная вдоль SVG-пути и доступ к точке по длине
  const sample = path => {
    const len = path.getTotalLength(), pts = [];
    for (let s = 0; s < len; s += 0.5) pts.push(path.getPointAtLength(s));
    pts.push(path.getPointAtLength(len));
    return pts.map(({ x, y }) => ({ x, y }));
  };
  const line = pts => {
    const acc = [0];
    for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const len = acc[acc.length - 1];
    const at = s => {
      s = Math.max(0, Math.min(len, s));
      let i = 1;
      while (i < acc.length - 1 && acc[i] < s) i++;
      const a = pts[i - 1], b = pts[i], f = (s - acc[i - 1]) / (acc[i] - acc[i - 1] || 1);
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    };
    const dir = s => {
      const a = at(s - 1.5), b = at(s + 1.5), d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: (b.x - a.x) / d, y: (b.y - a.y) / d };
    };
    return { len, at, dir, pts };
  };
  const reverse = L => line([...L.pts].reverse());
  const rot = (v, deg) => {
    const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    return { x: v.x * c - v.y * s, y: v.x * s + v.y * c };
  };

  // типы стежков
  const run = (L, step, from = 0, to = L.len) => {
    const n = Math.max(1, Math.round((to - from) / step));
    return Array.from({ length: n + 1 }, (_, i) => L.at(from + (to - from) * i / n));
  };
  const column = (L, widthAt, gap) => { // гладь: зигзаг от края к краю
    const n = Math.max(2, Math.round(L.len / gap));
    return Array.from({ length: n + 1 }, (_, i) => {
      const s = L.len * i / n, p = L.at(s), d = L.dir(s);
      const h = widthAt(i / n) / 2 * (i % 2 ? 1 : -1);
      return { x: p.x - d.y * h, y: p.y + d.x * h };
    });
  };

  // программа машины
  const events = [];
  let t = 0, cur = null, color = null, trimmed = true, pending = 0;
  const push = (e, ms) => { t += ms; e.t = t; events.push(e); };
  const sew = (pts, kind, linked = false) => {
    if (!linked) {
      const from = cur || PARK;
      if (trimmed) push({ type: 'move', a: from, b: pts[0] }, MS.move);
      else if (Math.hypot(pts[0].x - from.x, pts[0].y - from.y) > 1) { push({ type: 'jump', color, a: from, b: pts[0] }, MS.jump); pending++; }
      trimmed = false;
    } else pts = [cur, ...pts];
    for (let i = 1; i < pts.length; i++) push({ type: 'stitch', kind, color, a: pts[i - 1], b: pts[i] }, MS[kind]);
    cur = pts[pts.length - 1];
  };
  const trim = () => {
    const at = cur || PARK;
    if (pending) push({ type: 'trim', a: at, b: at }, MS.trim);
    pending = 0;
    trimmed = true;
  };
  const thread = c => {
    if (c === color) return;
    trim();
    color = c;
    push({ type: 'color', color: c, a: cur || PARK, b: cur || PARK }, MS.color);
  };
  const leaf = (L, s, side, flip) => {
    let d = L.dir(s);
    if (flip) d = { x: -d.x, y: -d.y };
    const p = L.at(s), tip = rot(d, side * 40), bend = rot(d, side * 18);
    const q = Array.from({ length: 25 }, (_, i) => {
      const u = i / 24, m = 2 * u * (1 - u);
      return {
        x: p.x + bend.x * 9 * m + tip.x * 17 * u * u,
        y: p.y + bend.y * 9 * m + tip.y * 17 * u * u,
      };
    });
    const ll = line(q);
    sew(run(ll, 4), 'under', true);
    sew(column(reverse(ll), u => 7 * Math.sin(Math.PI * u) ** 0.8, 1.1), 'leaf', true);
  };
  // венок: бегущий стежок по кругу, на нижней дуге листья смотрят вверх с обеих сторон
  const wreath = L => {
    const mid = L.len / 2;
    let prev = 0, side = 1;
    for (let s = L.len * 0.29; s <= L.len * 0.71; s += 16, side = -side) {
      if (Math.abs(s - mid) < 8) continue;
      sew(run(L, 5.5, prev, s), 'run', prev > 0);
      leaf(L, s, side, s < mid);
      prev = s;
    }
    sew(run(L, 5.5, prev, L.len), 'run', true);
  };

  for (const el of $$('[data-design] path', fig)) {
    thread(el.dataset.color);
    const L = line(sample(el));
    const kind = el.dataset.kind;
    if (kind === 'wreath') wreath(L);
    if (kind === 'column') {
      sew(run(L, 4), 'under');
      sew(column(reverse(L), () => +el.dataset.w, 1.5), 'satin', true);
    }
  }
  trim();
  push({ type: 'move', a: cur, b: PARK }, MS.move);
  const total = events.filter(e => e.type === 'stitch').length;

  // отрисовка
  const seg = (ctx, a, b, f0 = 0, f1 = 1, dx = 0, dy = 0) => {
    ctx.beginPath();
    ctx.moveTo(a.x + (b.x - a.x) * f0 + dx, a.y + (b.y - a.y) * f0 + dy);
    ctx.lineTo(a.x + (b.x - a.x) * f1 + dx, a.y + (b.y - a.y) * f1 + dy);
    ctx.stroke();
  };
  const drawStitch = e => {
    const th = THREADS[e.color], w = W[e.kind], satin = e.kind === 'satin' || e.kind === 'leaf';
    const gap = e.kind === 'run' ? 0.45 / (Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y) || 1) : 0; // прокол между стежками
    base.lineCap = satin ? 'butt' : 'round'; // у глади ровный край колонны
    base.lineWidth = w + 0.6;
    base.strokeStyle = `rgba(0,0,0,${satin ? 0.22 : 0.35})`;
    seg(base, e.a, e.b, gap, 1 - gap, 0.4, 0.7);
    base.lineWidth = w;
    base.strokeStyle = e.kind === 'under' ? th.under : th.base;
    seg(base, e.a, e.b, gap, 1 - gap);
    if (e.kind === 'under') return;
    // блик симметричен, чтобы у соседних стежков глади он сливался в ровную полосу
    base.lineWidth = w * 0.45;
    base.strokeStyle = `rgba(255,255,255,${th.hl * 0.45})`;
    seg(base, e.a, e.b, 0.22, 0.78);
  };
  let jumps = [];
  const drawJumps = live => {
    over.clearRect(0, 0, 400, 400);
    over.lineCap = 'round';
    for (const j of live ? [...jumps, live] : jumps) {
      over.lineWidth = 0.8;
      over.strokeStyle = THREADS[j.color].base;
      seg(over, j.a, j.b);
    }
  };
  const setThread = c => {
    threadPath.setAttribute('stroke', THREADS[c].base);
    swatch.style.background = THREADS[c].base;
    threadName.textContent = THREADS[c].name;
  };
  const setNeedle = (p, lift) => {
    needle.setAttribute('transform', `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`);
    bar.setAttribute('transform', `translate(0 ${(-lift * 10).toFixed(2)})`);
    foot.setAttribute('transform', `translate(0 ${(-lift * 3).toFixed(2)})`);
  };

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let idx = 0, count = 0, t0 = 0, again = 0;
  const apply = e => {
    if (e.type === 'stitch') { drawStitch(e); count++; }
    if (e.type === 'jump') jumps.push(e);
    if (e.type === 'trim') jumps = [];
    if (e.type === 'color') setThread(e.color);
  };
  const redraw = () => {
    for (const ctx of [base, over]) {
      const c = ctx.canvas, k = c.clientWidth * (devicePixelRatio || 1) / 400;
      c.width = c.height = Math.round(400 * k);
      ctx.setTransform(k, 0, 0, k, 0, 0);
    }
    jumps = [];
    count = 0;
    events.slice(0, idx).forEach(apply);
    drawJumps();
    counter.textContent = fmt(count);
  };
  const finish = () => {
    idx = events.length;
    redraw();
    setNeedle(PARK, 1);
    replay.hidden = false;
    if (!reduced) again = setTimeout(play, 4000); // готовая работа висит 4 с, потом шьётся заново
  };
  const frame = now => {
    const tt = now - t0;
    while (idx < events.length && events[idx].t <= tt) apply(events[idx++]);
    const e = events[idx];
    if (!e) return finish();
    const prev = idx ? events[idx - 1].t : 0, f = Math.min(1, (tt - prev) / (e.t - prev));
    const p = { x: e.a.x + (e.b.x - e.a.x) * f, y: e.a.y + (e.b.y - e.a.y) * f };
    setNeedle(p, e.type === 'stitch' ? Math.sin(f * Math.PI) : 1);
    drawJumps(e.type === 'jump' ? { color: e.color, a: e.a, b: p } : null);
    counter.textContent = fmt(count);
    requestAnimationFrame(frame);
  };
  const play = () => {
    clearTimeout(again);
    idx = 0;
    replay.hidden = true;
    redraw();
    setNeedle(PARK, 1);
    t0 = performance.now() + 400;
    requestAnimationFrame(frame);
  };

  new ResizeObserver(redraw).observe(fig);
  replay.addEventListener('click', play);
  if (reduced) finish();
  else play();
  console.assert(total > 500 && events.every(e => e.a && e.b), 'программа вышивки собрана неверно');
})();

/* Фильтр работ */
const chips = $$('.chip');
const setFilter = tag => {
  chips.forEach(c => c.setAttribute('aria-pressed', c.dataset.tag === tag));
  $$('.work').forEach(w => { w.hidden = tag && !w.dataset.tags.split(',').includes(tag); });
};
chips.forEach(c => c.addEventListener('click', () => setFilter(c.dataset.tag)));
$$('[data-filter]').forEach(a => a.addEventListener('click', () => setFilter(a.dataset.filter)));

/* Диалоги */
const lightbox = $('#lightbox');
$$('.work').forEach(w => w.addEventListener('click', () => {
  const img = $('img', w);
  Object.assign($('img', lightbox), { src: img.src, alt: img.alt });
  lightbox.showModal();
}));
$$('[data-open]').forEach(b => b.addEventListener('click', () => $('#' + b.dataset.open).showModal()));
$$('dialog').forEach(d => {
  d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-close]')) d.close(); });
});

/* Отправка форм */
const showError = (form, msg) => {
  const el = $('.form__error', form);
  el.textContent = msg;
  el.hidden = !msg;
};
const send = async form => {
  // shortcut: на GitHub Pages нет PHP, там форма только показывает успех; на боевом хостинге уходит в send.php
  if (location.hostname.endsWith('github.io')) return true;
  const btn = $('[type=submit]', form);
  btn.disabled = true;
  try {
    const res = await fetch(form.action, { method: 'POST', body: new FormData(form) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `Не удалось отправить заявку. Позвоните нам: ${PHONE}`);
    return true;
  } catch (e) {
    showError(form, e instanceof TypeError ? `Нет связи с сервером. Позвоните нам: ${PHONE}` : e.message);
    return false;
  } finally {
    btn.disabled = false;
  }
};
const checkContact = form => {
  const c = form.elements.contact;
  if (!c.value.trim()) return 'Укажите, как с вами связаться.';
  if (c.type === 'email' && !c.checkValidity()) return 'Проверьте адрес почты.';
  if (!form.elements.agree.checked) return 'Отметьте согласие на обработку данных.';
  return '';
};

const cb = $('[data-form="callback"]');
cb.addEventListener('submit', async e => {
  e.preventDefault();
  const err = checkContact(cb);
  showError(cb, err);
  if (err || !(await send(cb))) return;
  $('.modal__done', cb).hidden = false;
  $('[type=submit]', cb).hidden = true;
  cb.reset();
});

/* Квиз */
const quiz = $('[data-form="quiz"]');
const steps = $$('.qstep', quiz);
let step = 0;
const go = n => {
  step = n;
  steps.forEach((s, i) => { s.hidden = i !== n; });
  $('[data-prev]', quiz).hidden = n === 0;
  $('[data-next]', quiz).hidden = n === steps.length - 1;
  $('[data-submit]', quiz).hidden = n !== steps.length - 1;
  $('[data-stepnum]').textContent = n + 1;
  $('.quiz__progress span').style.width = (n + 1) / steps.length * 100 + '%';
  showError(quiz, '');
};
$('[data-next]', quiz).addEventListener('click', () => {
  const radio = $('input[type=radio][required]', steps[step]);
  if (radio && !quiz.elements[radio.name].value) return showError(quiz, 'Выберите один из вариантов.');
  go(step + 1);
  $('input', steps[step]).focus();
});
$('[data-prev]', quiz).addEventListener('click', () => go(step - 1));

const contactLabels = {
  Telegram: ['Ник или телефон в Telegram', 'text', 'tel'],
  WhatsApp: ['Телефон в WhatsApp', 'tel', 'tel'],
  'Почта': ['Email', 'email', 'email'],
};
$$('[name=channel]', quiz).forEach(r => r.addEventListener('change', () => {
  const [label, type, ac] = contactLabels[r.value];
  $('[data-contact-label]', quiz).textContent = label;
  Object.assign(quiz.elements.contact, { type, autocomplete: ac });
}));

const fileInput = quiz.elements.file;
fileInput.addEventListener('change', () => {
  const f = fileInput.files[0];
  if (f && f.size > 10 * 1024 * 1024) {
    fileInput.value = '';
    showError(quiz, 'Файл больше 10 МБ. Пришлите его на почту zayavka@korda.spb.ru после заявки.');
  } else showError(quiz, '');
  $('[data-filename]', quiz).textContent = fileInput.files[0]?.name || 'Прикрепить макет или фото';
});

quiz.addEventListener('submit', async e => {
  e.preventDefault();
  const err = checkContact(quiz);
  showError(quiz, err);
  if (err || !(await send(quiz))) return;
  quiz.hidden = true;
  const done = $('.quiz__done');
  done.hidden = false;
  done.focus();
});

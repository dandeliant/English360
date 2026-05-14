// Shared exercise behaviour for match / gap / tf.
//
// Markup contract per exercise root:
//   <form data-exercise data-exercise-type="match|gap|tf">
//     <ol>
//       <li data-item data-answer="..." [data-alts="alt1|alt2"]>
//         <input data-input ... />     -- text/select for match+gap
//         <input type="radio" data-input value="true|false">  -- for tf
//         <span data-feedback></span>
//       </li>
//     </ol>
//     <button data-action="check">Sprawdź</button>
//     <button data-action="reveal">Pokaż odpowiedzi</button>
//     <button data-action="reset" hidden>Wyczyść</button>
//     <p data-score hidden></p>
//   </form>

function normalize(s) {
  return (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function readUserAnswer(item, type) {
  if (type === 'tf') {
    const checked = item.querySelector('[data-input]:checked');
    return checked ? checked.value : '';
  }
  const input = item.querySelector('[data-input]');
  return input ? (input.value || '').trim() : '';
}

function isItemCorrect(item, userAnswer, type) {
  if (!userAnswer) return false;
  const expected = item.dataset.answer || '';

  if (type === 'match') {
    return userAnswer.toUpperCase() === expected.toUpperCase();
  }
  if (type === 'tf') {
    return userAnswer === expected;
  }
  if (type === 'gap') {
    const alts = (item.dataset.alts || '').split('|').filter(Boolean);
    const candidates = [expected, ...alts];
    const user = normalize(userAnswer);
    return candidates.some((c) => normalize(c) === user);
  }
  return false;
}

function setItemState(item, state /* 'correct' | 'incorrect' | 'empty' | '' */) {
  if (state) {
    item.dataset.state = state;
  } else {
    delete item.dataset.state;
  }
  const fb = item.querySelector('[data-feedback]');
  if (!fb) return;
  if (state === 'correct') {
    fb.textContent = '✓';
    fb.setAttribute('aria-label', 'odpowiedź poprawna');
  } else if (state === 'incorrect') {
    fb.textContent = '✗';
    fb.setAttribute('aria-label', 'odpowiedź niepoprawna');
  } else if (state === 'empty') {
    fb.textContent = '—';
    fb.setAttribute('aria-label', 'brak odpowiedzi');
  } else {
    fb.textContent = '';
    fb.removeAttribute('aria-label');
  }
}

function check(root, type) {
  const items = root.querySelectorAll('[data-item]');
  let correct = 0;
  const total = items.length;

  items.forEach((item) => {
    const user = readUserAnswer(item, type);
    if (!user) {
      setItemState(item, 'empty');
      return;
    }
    const ok = isItemCorrect(item, user, type);
    setItemState(item, ok ? 'correct' : 'incorrect');
    if (ok) correct++;
  });

  const score = root.querySelector('[data-score]');
  if (score) {
    score.hidden = false;
    if (correct === total) {
      score.textContent = `🎉 Komplet! ${correct} / ${total} poprawnych.`;
      score.dataset.tone = 'success';
    } else {
      score.textContent = `${correct} / ${total} poprawnych odpowiedzi.`;
      score.dataset.tone = correct > 0 ? 'partial' : 'fail';
    }
  }

  const resetBtn = root.querySelector('[data-action="reset"]');
  if (resetBtn) resetBtn.hidden = false;
}

function reveal(root, type) {
  root.querySelectorAll('[data-item]').forEach((item) => {
    const ans = item.dataset.answer;
    if (!ans) return;

    if (type === 'match' || type === 'gap') {
      const input = item.querySelector('[data-input]');
      if (input) input.value = ans;
    } else if (type === 'tf') {
      const radio = item.querySelector(`[data-input][value="${ans}"]`);
      if (radio) radio.checked = true;
    }
  });
  check(root, type);
}

function reset(root) {
  root.querySelectorAll('[data-item]').forEach((item) => {
    setItemState(item, '');
    item.querySelectorAll('[data-input]').forEach((input) => {
      if (input.type === 'radio' || input.type === 'checkbox') {
        input.checked = false;
      } else {
        input.value = '';
      }
    });
  });
  const score = root.querySelector('[data-score]');
  if (score) {
    score.hidden = true;
    score.textContent = '';
    delete score.dataset.tone;
  }
  const resetBtn = root.querySelector('[data-action="reset"]');
  if (resetBtn) resetBtn.hidden = true;
}

function setup(root) {
  const type = root.dataset.exerciseType;
  if (!type) return;

  root.addEventListener('submit', (e) => {
    e.preventDefault();
    check(root, type);
  });

  root.querySelectorAll('[data-action="check"]').forEach((btn) =>
    btn.addEventListener('click', () => check(root, type)),
  );
  root.querySelectorAll('[data-action="reveal"]').forEach((btn) =>
    btn.addEventListener('click', () => reveal(root, type)),
  );
  root.querySelectorAll('[data-action="reset"]').forEach((btn) =>
    btn.addEventListener('click', () => reset(root)),
  );
}

function init() {
  document.querySelectorAll('[data-exercise]').forEach(setup);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

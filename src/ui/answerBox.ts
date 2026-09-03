/**
 * The always-focused text input shared by both modes. Pure DOM component:
 * no import from engine/, no session awareness, no game logic — it emits
 * raw input/submit events upward and renders whatever primitive values
 * (armed label text, disabled flag) it's handed.
 *
 * Mode A (free-recall) drives itself off onInput, matching on every
 * keystroke. Mode B (pin-and-name) drives itself off onSubmit, matching
 * only on Enter. Both handlers always fire regardless of mode — which one
 * a caller listens to is the mode's decision, not this component's.
 */
export interface AnswerBox {
  el: HTMLElement;
  /** Fires with the input's current value on every keystroke (Mode A). */
  onInput(handler: (value: string) => void): void;
  /** Fires with the input's current value on Enter (Mode B). */
  onSubmit(handler: (value: string) => void): void;
  /** Empties the box without losing focus. */
  clear(): void;
  /** Plays a brief rejection animation. Never touches the input's value. */
  shake(): void;
  /** Disabled while the session is paused, complete, or surrendered — also stops refocus-on-blur. */
  setDisabled(disabled: boolean): void;
  /** Shows "Naming: <text>" above the box (Mode B, target armed); null hides it. */
  setArmedLabel(text: string | null): void;
  destroy(): void;
}

export function createAnswerBox(): AnswerBox {
  const el = document.createElement('div');
  el.className = 'answer-box';

  const armedLabel = document.createElement('div');
  armedLabel.className = 'armed-label';
  armedLabel.hidden = true;
  el.appendChild(armedLabel);

  const input = document.createElement('input');
  input.type = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  el.appendChild(input);

  let inputHandler: ((value: string) => void) | null = null;
  let submitHandler: ((value: string) => void) | null = null;
  let refocusOnBlur = true;

  function handleInput(): void {
    inputHandler?.(input.value);
  }

  function handleKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    submitHandler?.(input.value);
  }

  function handleBlur(): void {
    if (!refocusOnBlur) return;
    // Deferred: refocusing synchronously from inside the blur handler
    // itself is unreliable across browsers.
    queueMicrotask(() => {
      if (refocusOnBlur) input.focus();
    });
  }

  function handleAnimationEnd(): void {
    el.classList.remove('shake');
  }

  input.addEventListener('input', handleInput);
  input.addEventListener('keydown', handleKeydown);
  input.addEventListener('blur', handleBlur);
  el.addEventListener('animationend', handleAnimationEnd);

  input.focus();

  return {
    el,
    onInput(handler) {
      inputHandler = handler;
    },
    onSubmit(handler) {
      submitHandler = handler;
    },
    clear() {
      input.value = '';
      input.focus();
    },
    shake() {
      // Restart the animation even if a shake is already mid-flight: drop
      // the class, force a reflow, then re-add it.
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
    },
    setDisabled(disabled) {
      input.disabled = disabled;
      refocusOnBlur = !disabled;
      el.classList.toggle('disabled', disabled);
    },
    setArmedLabel(text) {
      armedLabel.textContent = text === null ? '' : `Naming: ${text}`;
      armedLabel.hidden = text === null;
    },
    destroy() {
      input.removeEventListener('input', handleInput);
      input.removeEventListener('keydown', handleKeydown);
      input.removeEventListener('blur', handleBlur);
      el.removeEventListener('animationend', handleAnimationEnd);
      el.remove();
    },
  };
}

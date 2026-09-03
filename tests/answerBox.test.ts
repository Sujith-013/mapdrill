// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createAnswerBox } from '../src/ui/answerBox';

function input(box: ReturnType<typeof createAnswerBox>): HTMLInputElement {
  return box.el.querySelector('input')!;
}

function type(el: HTMLInputElement, value: string): void {
  el.value = value;
  el.dispatchEvent(new Event('input'));
}

function pressEnter(el: HTMLInputElement): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
}

describe('createAnswerBox', () => {
  it('emits onInput with the current value on every keystroke', () => {
    const box = createAnswerBox();
    const handler = vi.fn();
    box.onInput(handler);

    type(input(box), 'K');
    type(input(box), 'Ke');

    expect(handler.mock.calls).toEqual([['K'], ['Ke']]);
  });

  it('fires onSubmit (not a duplicate onInput) on Enter', () => {
    const box = createAnswerBox();
    const onInput = vi.fn();
    const onSubmit = vi.fn();
    box.onInput(onInput);
    box.onSubmit(onSubmit);

    type(input(box), 'Kerala');
    onInput.mockClear();
    pressEnter(input(box));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith('Kerala');
    expect(onInput).not.toHaveBeenCalled();
  });

  it('clear() empties the box without losing focus', () => {
    const box = createAnswerBox();
    document.body.appendChild(box.el);
    const el = input(box);
    el.value = 'Tamil Nadu';
    el.focus();

    box.clear();

    expect(el.value).toBe('');
    expect(document.activeElement).toBe(el);
  });

  it('shake() toggles the shake class without touching the input value', () => {
    const box = createAnswerBox();
    input(box).value = 'Kerala';

    box.shake();

    expect(box.el.classList.contains('shake')).toBe(true);
    expect(input(box).value).toBe('Kerala');
  });

  it('setDisabled(true) disables the input and stops refocus-on-blur', async () => {
    const box = createAnswerBox();
    document.body.appendChild(box.el);
    const el = input(box);
    el.focus();

    box.setDisabled(true);
    expect(el.disabled).toBe(true);

    el.blur();
    await Promise.resolve(); // let the deferred refocus microtask run, if any
    expect(document.activeElement).not.toBe(el);
  });

  it('setArmedLabel shows "Naming: <text>" and hides on null', () => {
    const box = createAnswerBox();
    const label = box.el.querySelector('.armed-label') as HTMLElement;

    box.setArmedLabel('Kerala');
    expect(label.hidden).toBe(false);
    expect(label.textContent).toBe('Naming: Kerala');

    box.setArmedLabel(null);
    expect(label.hidden).toBe(true);
  });
});

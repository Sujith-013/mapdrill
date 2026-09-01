/**
 * The always-focused text input shared by both modes. Re-focuses on blur
 * (except when intentionally disabled, e.g. session complete), clears on
 * each accepted match.
 */
export interface InputBox {
  el: HTMLInputElement;
  onInput(handler: (value: string) => void): void;
  clear(): void;
  setDisabled(disabled: boolean): void;
  destroy(): void;
}

export function createInputBox(): InputBox {
  throw new Error('TODO');
}

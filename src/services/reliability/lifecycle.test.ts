import { afterEach, describe, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ invoke: vi.fn(async () => {}), available: true }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: native.invoke, isTauri: () => native.available }));
import { registerCloseGuard, requestClose } from './lifecycle';
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn());
  native.invoke.mockReset();
  native.available = true;
});
describe('shared close and explicit Quit guards', () => {
  it('does not hide or quit while a guard retains unsaved work', async () => {
    let finish: (() => Promise<void>) | undefined;
    cleanups.push(
      registerCloseGuard((callback) => {
        finish = callback;
      }),
    );
    await requestClose(true);
    expect(native.invoke).not.toHaveBeenCalled();
    await finish!();
    expect(native.invoke).toHaveBeenCalledWith('lifecycle_finish', { quit: true });
  });
  it('runs every guard before finishing once', async () => {
    const order: number[] = [];
    cleanups.push(
      registerCloseGuard((finish) => {
        order.push(1);
        void finish();
      }),
    );
    cleanups.push(
      registerCloseGuard((finish) => {
        order.push(2);
        void finish();
      }),
    );
    await requestClose();
    expect(order).toEqual([2, 1]);
    expect(native.invoke).toHaveBeenCalledTimes(1);
  });
  it('does not reuse an obsolete confirmation callback', async () => {
    const callbacks: (() => Promise<void>)[] = [];
    cleanups.push(
      registerCloseGuard((finish) => {
        callbacks.push(finish);
      }),
    );
    await requestClose();
    await requestClose(true);
    await callbacks[0]();
    expect(native.invoke).not.toHaveBeenCalled();
    await callbacks[1]();
    await callbacks[1]();
    expect(native.invoke).toHaveBeenCalledTimes(1);
  });
  it('does not call native lifecycle commands in the browser', async () => {
    native.available = false;
    await requestClose(true);
    expect(native.invoke).not.toHaveBeenCalled();
  });
});

import { createContext } from "preact";
import { useContext } from "preact/hooks";
import type { BatcController } from "../core/controller";
import { prefs } from "../core/prefs";

export const ControllerContext = createContext<BatcController | null>(null);

export function useCtl(): BatcController {
  const c = useContext(ControllerContext);
  if (!c) throw new Error("ControllerContext missing");
  return c;
}

/** Short vibration on touch (Android; ignored elsewhere). */
export function haptic(pattern: number | number[] = 12): void {
  if (!prefs.value.haptics) return;
  try { navigator.vibrate?.(pattern); } catch { /* ignore */ }
}

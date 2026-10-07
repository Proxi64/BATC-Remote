import { displayHost, resolveBatcUrl } from "../core/host";
import type { BatcController } from "../core/controller";
import { dict } from "../i18n";
import { haptic } from "./ctx";
import { toast } from "./toast";

/** Runs a QR scan and tells the user what happened. Returns true when an address was set. */
export async function scanAndReport(ctl: BatcController): Promise<boolean> {
  const t = dict.value;
  const r = await ctl.scanForPc();
  switch (r.kind) {
    case "ok": {
      haptic();
      const url = resolveBatcUrl({ host: r.target.host, port: r.target.port }, null, { hostname: "", search: "", protocol: "app:" });
      const addr = url ? displayHost(url) : r.target.host;
      toast(r.target.fromPc ? t.scanDone(addr) : t.scanNoPcConfig(addr), 2500);
      return true;
    }
    case "invalid": toast(t.scanInvalid, 2500); return false;
    case "unavailable": toast(t.scanUnavailable, 2500); return false;
    default: return false;
  }
}

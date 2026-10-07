import { render } from "preact";
import { BatcController } from "./core/controller";
import { App } from "./ui/App";
import { ControllerContext } from "./ui/ctx";
import "./styles.css";

const controller = new BatcController();

render(
  <ControllerContext.Provider value={controller}>
    <App />
  </ControllerContext.Provider>,
  document.getElementById("app")!
);

controller.start();

// Debug access from the browser console: window.batc.store.log.value …
(window as unknown as { batc: BatcController }).batc = controller;

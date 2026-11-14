import { hydrateRoot } from "react-dom/client";
import { App } from "./App";
import type { BootData } from "@imgdown/shared";

declare global {
  interface Window {
    __BOOT__: BootData;
  }
}

const container = document.querySelector<HTMLElement>("#root");
const boot = window.__BOOT__;

if (container && boot) {
  hydrateRoot(container, <App boot={boot} />);
}

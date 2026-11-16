/**
 * Minimal Electrobun 2.0 declarations for the desktop PoC.
 * Hutch generates the full SDK types under `.hutch/devkit` after
 * `bunx electrobun sync`; these stubs keep `bun check` runnable in CI
 * without downloading the desktop toolchain.
 */
declare module "electrobun" {
  export type ElectrobunConfig = {
    app: {
      name: string;
      identifier: string;
      version: string;
    };
    build: {
      mainProcess: "bun" | "cottontail" | "zig" | "rust" | "go" | "odin";
      bun?: {
        entrypoint: string;
      };
      copy?: Record<string, string>;
    };
  };
}

declare module "electrobun/main" {
  export type BrowserWindowOptions = {
    title?: string;
    url?: string | null;
    html?: string | null;
    frame?: {
      x?: number;
      y?: number;
      width: number;
      height: number;
    };
  };

  /** Native window with an attached webview. */
  export class BrowserWindow {
    /**
     * Creates a native window and its initial webview.
     * @param options - Window and webview options.
     */
    constructor(options?: BrowserWindowOptions);

    /**
     * Subscribes to a window event.
     * @param event - Event name.
     * @param handler - Event handler.
     */
    on(event: string, handler: (event: unknown) => void): void;
  }

  export const PATHS: {
    /** Resources directory inside the app bundle. */
    RESOURCES_FOLDER: string;
    /** Views directory backing the `views://` scheme. */
    VIEWS_FOLDER: string;
  };

  export const Utils: {
    paths: {
      /** Writable per-user data directory for this app. */
      userData: string;
    };

    /**
     * Quits the application.
     * @param exitCode - Process exit code.
     */
    quit(exitCode?: number): void;
  };
}

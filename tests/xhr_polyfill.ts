import * as fs from "fs";
import * as path from "path";

export function polyfillXHR() {
  if (typeof globalThis.XMLHttpRequest !== "undefined") return;

  class SimpleXMLHttpRequest {
    public readyState: number = 0;
    public status: number = 0;
    public statusText: string = "";
    public responseType: string = "";
    public response: any = null;
    public responseText: string = "";
    public onload: ((ev?: any) => void) | null = null;
    public onerror: ((err?: any) => void) | null = null;
    public onreadystatechange: ((ev?: any) => void) | null = null;
    private listeners: Map<string, Function[]> = new Map();
    private url: string = "";

    addEventListener(type: string, listener: Function) {
      if (!this.listeners.has(type)) {
        this.listeners.set(type, []);
      }
      this.listeners.get(type)!.push(listener);
    }

    removeEventListener(type: string, listener: Function) {
      const arr = this.listeners.get(type);
      if (arr) {
        const idx = arr.indexOf(listener);
        if (idx !== -1) arr.splice(idx, 1);
      }
    }

    private emit(type: string, event?: any) {
      const arr = this.listeners.get(type);
      if (arr) {
        for (const fn of arr) {
          fn(event || { type, target: this });
        }
      }
    }

    getResponseHeader(header: string): string | null {
      if (header.toLowerCase() === "content-type") {
        return "model/gltf-binary";
      }
      return null;
    }

    getAllResponseHeaders(): string {
      return "content-type: model/gltf-binary\r\n";
    }

    open(method: string, url: string, async?: boolean) {
      this.url = url;
      this.readyState = 1;
      this.emit("readystatechange");
      if (this.onreadystatechange) this.onreadystatechange();
    }

    send() {
      try {
        let filePath = this.url;
        if (!path.isAbsolute(filePath)) {
          let resolved = path.join(process.cwd(), "public", filePath);
          if (!fs.existsSync(resolved)) {
            const playerTex = path.join(process.cwd(), "public", "assets", "characters", "player", filePath);
            const dungeonTex = path.join(process.cwd(), "public", "assets", "dungeon", filePath);
            if (fs.existsSync(playerTex)) {
              resolved = playerTex;
            } else if (fs.existsSync(dungeonTex)) {
              resolved = dungeonTex;
            }
          }
          filePath = resolved;
        }

        const buffer = fs.readFileSync(filePath);
        this.status = 200;
        this.statusText = "OK";
        this.readyState = 4;

        if (this.responseType === "arraybuffer") {
          const ab = new ArrayBuffer(buffer.length);
          const view = new Uint8Array(ab);
          for (let i = 0; i < buffer.length; ++i) {
            view[i] = buffer[i];
          }
          this.response = ab;
        } else {
          this.responseText = buffer.toString("utf-8");
          this.response = this.responseText;
        }

        this.emit("readystatechange");
        if (this.onreadystatechange) this.onreadystatechange();
        this.emit("load");
        if (this.onload) this.onload();
      } catch (err: any) {
        this.status = 404;
        this.statusText = err.message;
        this.readyState = 4;
        this.emit("readystatechange");
        if (this.onreadystatechange) this.onreadystatechange();
        this.emit("error", err);
        if (this.onerror) this.onerror(err);
      }
    }

    setRequestHeader() { }
  }

  (globalThis as any).XMLHttpRequest = SimpleXMLHttpRequest;
}

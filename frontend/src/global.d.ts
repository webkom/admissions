import { DjangoConfig } from "./utils/config";
import { DjangoData } from "./utils/djangoData";

declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: "development" | "production";
    }
  }
  interface Window {
    __CONFIG__: DjangoConfig;
    __DJANGO__: DjangoData;
  }
}

// If this file has no import/export statements (i.e. is a script)
// convert it into a module by adding an empty export statement.
export {};

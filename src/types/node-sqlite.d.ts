declare module "node:sqlite" {
  export class DatabaseSync {
    constructor(filename: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }

  export interface StatementSync {
    get(...parameters: unknown[]): Record<string, unknown> | undefined;
    run(...parameters: unknown[]): void;
  }
}

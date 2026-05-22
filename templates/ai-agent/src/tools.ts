export interface Tool<Args = unknown, Result = unknown> {
  name: string;
  description: string;
  handler: (args: Args) => Promise<Result> | Result;
}

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register<Args, Result>(tool: Tool<Args, Result>): void {
    this.tools.set(tool.name, tool as Tool);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): { name: string; description: string }[] {
    return [...this.tools.values()].map((t) => ({
      name: t.name,
      description: t.description,
    }));
  }

  async invoke(name: string, args: unknown): Promise<unknown> {
    const t = this.tools.get(name);
    if (!t) throw new Error(`tool not registered: ${name}`);
    return t.handler(args);
  }
}

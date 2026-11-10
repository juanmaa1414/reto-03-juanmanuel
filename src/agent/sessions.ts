import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import type { AgentMessage } from "../llm/adapter.js";
import { outPath } from "../tools/fixtures.js";

export type SessionStatus = "active" | "completed" | "paused";

export type StoredSession = {
  id: string;
  messages: AgentMessage[];
  createdAt: string;
  updatedAt: string;
  status: SessionStatus;
  metadata?: Record<string, unknown>;
};

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * File-based session store. Sessions survive server restarts and are written
 * atomically (temp file + rename) into out/sessions/.
 */
export class SessionStore {
  private readonly directory: string;
  private readonly now: () => Date;

  constructor(directory: string, now: () => Date = () => new Date()) {
    this.directory = directory;
    this.now = now;
  }

  private get sessionsDir(): string {
    return outPath(this.directory, "sessions");
  }

  private filePath(id: string): string {
    if (!SAFE_ID.test(id)) {
      throw new Error(`Identificador de sesión inválido: "${id}".`);
    }
    return resolve(this.sessionsDir, `${id}.json`);
  }

  private ensureDir(): void {
    mkdirSync(this.sessionsDir, { recursive: true });
  }

  create(id: string = randomUUID()): StoredSession {
    const timestamp = this.now().toISOString();
    const session: StoredSession = {
      id,
      messages: [],
      createdAt: timestamp,
      updatedAt: timestamp,
      status: "active",
    };
    this.save(session);
    return session;
  }

  get(id: string): StoredSession | null {
    const path = this.filePath(id);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, "utf8")) as StoredSession;
    } catch {
      return null;
    }
  }

  getOrCreate(id?: string): StoredSession {
    if (id) {
      const existing = this.get(id);
      if (existing) return existing;
      return this.create(id);
    }
    return this.create();
  }

  save(session: StoredSession): StoredSession {
    this.ensureDir();
    const timestamp = this.now().toISOString();
    const toSave: StoredSession = {
      ...session,
      updatedAt: timestamp,
    };
    const target = this.filePath(session.id);
    const temp = `${target}.tmp-${process.pid}-${randomUUID().slice(0, 8)}`;
    writeFileSync(temp, `${JSON.stringify(toSave, null, 2)}\n`, "utf8");
    renameSync(temp, target);
    return toSave;
  }

  update(
    id: string,
    patch: Partial<Pick<StoredSession, "messages" | "status" | "metadata">>,
  ): StoredSession | null {
    const existing = this.get(id);
    if (!existing) return null;
    return this.save({ ...existing, ...patch });
  }

  appendMessages(id: string, messages: AgentMessage[]): StoredSession {
    const session = this.getOrCreate(id);
    return this.save({
      ...session,
      messages: [...session.messages, ...messages],
    });
  }

  list(): StoredSession[] {
    if (!existsSync(this.sessionsDir)) return [];
    return readdirSync(this.sessionsDir)
      .filter((file) => file.endsWith(".json"))
      .flatMap((file) => {
        try {
          return [JSON.parse(readFileSync(resolve(this.sessionsDir, file), "utf8")) as StoredSession];
        } catch {
          return [];
        }
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  delete(id: string): void {
    const path = this.filePath(id);
    if (existsSync(path)) rmSync(path);
  }
}

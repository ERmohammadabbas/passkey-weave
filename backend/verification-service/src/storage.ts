import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { logger } from './logger';
import path from 'path';

class Storage {
  private db: Database | null = null;

  async init() {
    try {
      this.db = await open({
        filename: path.join(__dirname, '../data/credentials.db'),
        driver: sqlite3.Database,
      });

      await this.db.exec(`
        CREATE TABLE IF NOT EXISTS credentials (
          id TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      logger.info('Storage initialized successfully');
    } catch (error: any) {
      logger.error(`Failed to initialize storage: ${error.message}`);
      throw error;
    }
  }

  async get(id: string): Promise<any | null> {
    if (!this.db) await this.init();

    try {
      const result = await this.db!.get(
        'SELECT data FROM credentials WHERE id = ?',
        [id]
      );
      return result ? JSON.parse(result.data) : null;
    } catch (error: any) {
      logger.error(`Failed to get credential ${id}: ${error.message}`);
      throw error;
    }
  }

  async save(id: string, data: any): Promise<void> {
    if (!this.db) await this.init();

    try {
      await this.db!.run(
        'INSERT OR REPLACE INTO credentials (id, data) VALUES (?, ?)',
        [id, JSON.stringify(data)]
      );
    } catch (error: any) {
      logger.error(`Failed to save credential ${id}: ${error.message}`);
      throw error;
    }
  }
}

export const storage = new Storage();

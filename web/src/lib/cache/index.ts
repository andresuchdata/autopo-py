interface CacheConfig {
  ttl: number; // Time to live in milliseconds
}

interface CacheItem<T = any> {
  data: T;
  timestamp: number;
}

class CacheService {
  private dbName = 'healthMonitorDB';
  private storeName = 'healthData';
  private db: IDBDatabase | null = null;

  constructor(private config: CacheConfig) {}

  private async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject('Error opening database');
      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
    });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction(this.storeName, 'readonly');
        const store = tx.objectStore(this.storeName);
        const request = store.get(key);
        
        request.onsuccess = () => {
          const item: CacheItem<T> | undefined = request.result;
          if (!item) return resolve(null);
          
          const isExpired = (Date.now() - item.timestamp) > this.config.ttl;
          return isExpired ? resolve(null) : resolve(item.data);
        };
        request.onerror = () => resolve(null);
      });
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  async set<T>(key: string, data: T): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        
        store.put({
          data,
          timestamp: Date.now()
        } as CacheItem<T>, key);
        
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  async clear(): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(this.storeName, 'readwrite');
        const store = tx.objectStore(this.storeName);
        const request = store.clear();
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }
}

// Export a singleton instance
export const cache = new CacheService({ ttl: 5 * 60 * 1000 }); // 5 minutes TTL

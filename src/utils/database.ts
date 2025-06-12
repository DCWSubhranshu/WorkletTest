import SQLite from 'react-native-sqlite-storage';
import RNFS from 'react-native-fs';
import { Platform } from 'react-native';

// Define User type
interface User {
  userId: string;
  embedding: number[];
}

// Singleton database instance
let db: SQLite.Database | null = null;

// Open database connection
const openDB = () => {
  return new Promise<SQLite.Database>((resolve, reject) => {
    if (db) {
      resolve(db);
      return;
    }

    db = SQLite.openDatabase(
      {
        name: 'attendance.db',
        location: 'default',
      },
      () => {
        console.log('Database opened successfully');
        resolve(db!);
      },
      (error) => {
        console.error('Database connection error:', error);
        db = null;
        reject(error);
      }
    );
  });
};

// Initialize database tables
export const initDB = async () => {
  try {
    const database = await openDB();
    return new Promise((resolve, reject) => {
      database.transaction(
        (tx) => {
          tx.executeSql('PRAGMA foreign_keys = ON;');
          
          tx.executeSql(
            `CREATE TABLE IF NOT EXISTS Users (
              id INTEGER PRIMARY KEY AUTOINCREMENT, 
              userId TEXT UNIQUE, 
              embedding TEXT,
              createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
              updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            [],
            () => console.log('Users table created successfully'),
            (_, error) => {
              console.error('Users table creation error:', error);
              return false;
            }
          );
          
          tx.executeSql(
            `CREATE TABLE IF NOT EXISTS VerificationLogs (
              id INTEGER PRIMARY KEY AUTOINCREMENT, 
              userId TEXT, 
              timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY(userId) REFERENCES Users(userId) ON DELETE CASCADE
            )`,
            [],
            () => console.log('VerificationLogs table created successfully'),
            (_, error) => {
              console.error('VerificationLogs table creation error:', error);
              return false;
            }
          );

          tx.executeSql(
            'CREATE INDEX IF NOT EXISTS idx_users_userId ON Users(userId)',
            [],
            () => console.log('Users index created successfully'),
            (_, error) => console.error('Index creation error:', error)
          );

          tx.executeSql(
            'CREATE INDEX IF NOT EXISTS idx_logs_userId ON VerificationLogs(userId)',
            [],
            () => console.log('Logs index created successfully'),
            (_, error) => console.error('Index creation error:', error)
          );

          tx.executeSql(
            'CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON VerificationLogs(timestamp)',
            [],
            () => console.log('Timestamp index created successfully'),
            (_, error) => console.error('Index creation error:', error)
          );
        },
        (error) => {
          console.error('Transaction error:', error);
          reject(error);
        },
        () => {
          console.log('Database initialization completed');
          resolve(true);
        }
      );
    });
  } catch (error) {
    console.error('initDB error:', error);
    throw error;
  }
};

// Helper function to validate user data
const isValidUser = (userId: string, embedding: any): boolean => {
  if (!userId || typeof userId !== 'string' || userId.trim() === '') {
    console.error('Invalid userId:', userId);
    return false;
  }
  // Handle array-like objects (e.g., Float32Array)
  let embeddingArray: number[];
  if (Array.isArray(embedding)) {
    embeddingArray = embedding;
  } else if (embedding && typeof embedding === 'object' && embedding.length > 0) {
    embeddingArray = Array.from(embedding) as number[];
  } else {
    console.error('Invalid embedding: not an array or array-like object', embedding);
    return false;
  }
  if (embeddingArray.length === 0 || !embeddingArray.every(num => typeof num === 'number' && isFinite(num))) {
    console.error('Invalid embedding: empty or contains non-numeric values', embeddingArray);
    return false;
  }
  return true;
};

// Save a single user
export const saveUser = async (userId: string, embedding: any) => {
  if (!isValidUser(userId, embedding)) {
    throw new Error('Invalid user data');
  }

  const database = await openDB();
  // Convert embedding to number[] if not already
  const embeddingArray = Array.isArray(embedding) ? embedding : Array.from(embedding) as number[];
  return new Promise((resolve, reject) => {
    database.transaction(
      (tx) => {
        tx.executeSql(
          `INSERT OR REPLACE INTO Users 
          (userId, embedding, updatedAt) 
          VALUES (?, ?, datetime('now'))`,
          [userId, JSON.stringify(embeddingArray)],
          (_, result) => resolve(result),
          (_, error) => {
            console.error('Error saving user:', error);
            reject(error);
          }
        );
      },
      (error) => reject(error)
    );
  });
};

// Save multiple users in a single transaction
export const saveMultipleUsers = async (users: { userId: string; embedding: number[] }[]) => {
  for (const user of users) {
    if (!isValidUser(user.userId, user.embedding)) {
      throw new Error(`Invalid data for user: ${user.userId}`);
    }
  }

  const database = await openDB();
  return new Promise((resolve, reject) => {
    database.transaction(
      (tx) => {
        users.forEach(({ userId, embedding }) => {
          tx.executeSql(
            `INSERT OR REPLACE INTO Users 
            (userId, embedding, updatedAt) 
            VALUES (?, ?, datetime('now'))`,
            [userId, JSON.stringify(embedding)]
          );
        });
      },
      (error) => {
        console.error('Bulk save error:', error);
        reject(error);
      },
      () => resolve(true)
    );
  });
};

// Get all users
export const getUsers = async (): Promise<User[]> => {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    database.transaction(
      (tx) => {
        tx.executeSql(
          'SELECT userId, embedding FROM Users',
          [],
          (_, { rows }) => {
            const users: User[] = [];
            for (let i = 0; i < rows.length; i++) {
              try {
                users.push({
                  userId: rows.item(i).userId,
                  embedding: JSON.parse(rows.item(i).embedding),
                });
              } catch (error) {
                console.error(`Error parsing embedding for user ${rows.item(i).userId}:`, error);
              }
            }
            resolve(users);
          },
          (_, error) => {
            console.error('Error fetching users:', error);
            reject(error);
          }
        );
      },
      (error) => reject(error)
    );
  });
};

// Get a single user by ID
export const getUser = async (userId: string): Promise<User | null> => {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    database.transaction(
      (tx) => {
        tx.executeSql(
          'SELECT userId, embedding FROM Users WHERE userId = ?',
          [userId],
          (_, { rows }) => {
            if (rows.length > 0) {
              try {
                resolve({
                  userId: rows.item(0).userId,
                  embedding: JSON.parse(rows.item(0).embedding),
                });
              } catch (error) {
                console.error(`Error parsing embedding for user ${userId}:`, error);
                reject(error);
              }
            } else {
              resolve(null);
            }
          },
          (_, error) => {
            console.error('Error fetching user:', error);
            reject(error);
          }
        );
      },
      (error) => reject(error)
    );
  });
};

// Delete a user
export const deleteUser = async (userId: string) => {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    database.transaction(
      (tx) => {
        tx.executeSql(
          'DELETE FROM Users WHERE userId = ?',
          [userId],
          (_, result) => resolve(result),
          (_, error) => {
            console.error('Error deleting user:', error);
            reject(error);
          }
        );
      },
      (error) => reject(error)
    );
  });
};

// Log a verification event
export const logVerification = async (userId: string) => {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    database.transaction(
      (tx) => {
        tx.executeSql(
          'INSERT INTO VerificationLogs (userId) VALUES (?)',
          [userId],
          (_, result) => resolve(result),
          (_, error) => {
            console.error('Error logging verification:', error);
            reject(error);
          }
        );
      },
      (error) => reject(error)
    );
  });
};

// Get all verification logs
export const getVerificationLogs = async (limit = 100) => {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    database.transaction(
      (tx) => {
        tx.executeSql(
          `SELECT userId, timestamp 
           FROM VerificationLogs 
           ORDER BY timestamp DESC
           LIMIT ?`,
          [limit],
          (_, { rows }) => {
            const logs = [];
            for (let i = 0; i < rows.length; i++) {
              logs.push({
                userId: rows.item(i).userId,
                timestamp: rows.item(i).timestamp,
              });
            }
            resolve(logs);
          },
          (_, error) => {
            console.error('Error fetching verification logs:', error);
            reject(error);
          }
        );
      },
      (error) => reject(error)
    );
  });
};

// Get verification logs for a specific user
export const getUserVerificationLogs = async (userId: string, limit = 20) => {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    database.transaction(
      (tx) => {
        tx.executeSql(
          `SELECT timestamp 
           FROM VerificationLogs 
           WHERE userId = ?
           ORDER BY timestamp DESC
           LIMIT ?`,
          [userId, limit],
          (_, { rows }) => {
            const logs = [];
            for (let i = 0; i < rows.length; i++) {
              logs.push(rows.item(i).timestamp);
            }
            resolve(logs);
          },
          (_, error) => {
            console.error('Error fetching user verification logs:', error);
            reject(error);
          }
        );
      },
      (error) => reject(error)
    );
  });
};

// Get user count
export const getUsersCount = async () => {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    database.transaction(
      (tx) => {
        tx.executeSql(
          'SELECT COUNT(*) as count FROM Users',
          [],
          (_, { rows }) => resolve(rows.item(0).count),
          (_, error) => {
            console.error('Error counting users:', error);
            reject(error);
          }
        );
      },
      (error) => reject(error)
    );
  });
};

// Backup database
export const backupDatabase = async (backupPath: string) => {
  const currentDbPath = Platform.OS === 'ios'
    ? `${RNFS.DocumentDirectoryPath}/attendance.db`
    : `${RNFS.DocumentDirectoryPath}/attendance.db`; // Adjust for Android
  try {
    await RNFS.copyFile(currentDbPath, backupPath);
    console.log('Database backup successful');
    return true;
  } catch (error) {
    console.error('Backup failed:', error);
    throw error;
  }
};

// Restore database
export const restoreDatabase = async (backupPath: string) => {
  const currentDbPath = Platform.OS === 'ios'
    ? `${RNFS.DocumentDirectoryPath}/attendance.db`
    : `${RNFS.DocumentDirectoryPath}/attendance.db`; // Adjust for Android
  try {
    if (db) {
      await db.close();
      db = null;
    }
    await RNFS.copyFile(backupPath, currentDbPath);
    console.log('Database restore successful');
    await openDB();
    return true;
  } catch (error) {
    console.error('Restore failed:', error);
    throw error;
  }
};

// Export the db instance for direct access if needed
export { db };
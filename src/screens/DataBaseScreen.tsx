import React, { useEffect, useState } from 'react';
import { View, Text, Button, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { initDB, getUsers, saveUser, deleteUser } from '../utils/database';

// Define User type for TypeScript
interface User {
  userId: string;
  embedding: number[];
}

const DataBaseScreen: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeAndFetch = async () => {
      setIsLoading(true);
      setError(null);
      try {
        await initDB(); // Ensure database is initialized
        await fetchUsers();
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize database';
        setError(errorMessage);
        console.error('Initialization error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    initializeAndFetch();
  }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const fetchedUsers = await getUsers();
      setUsers(fetchedUsers as User[]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to fetch users';
      setError(errorMessage);
      console.error('Error fetching users:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddUser = async () => {
    const userId = `user_${Date.now()}`;
    const embedding = Array.from({ length: 128 }, () => Math.random()); // Example: 128D embedding
    setIsLoading(true);
    setError(null);
    try {
      if (!embedding.every(num => typeof num === 'number')) {
        throw new Error('Invalid embedding: must be an array of numbers');
      }
      await saveUser(userId, embedding);
      await fetchUsers();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save user';
      setError(errorMessage);
      console.error('Error saving user:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setIsLoading(true);
    setError(null);
    try {
      await deleteUser(userId);
      await fetchUsers();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete user';
      setError(errorMessage);
      console.error('Error deleting user:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const renderUser = ({ item }: { item: User }) => (
    <View style={styles.userItem}>
      <Text style={styles.userText}>User ID: {item.userId}</Text>
      <Button title="Delete" onPress={() => handleDeleteUser(item.userId)} color="#ff4444" />
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Database Screen</Text>
      {isLoading && <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />}
      {error && <Text style={styles.error}>{error}</Text>}
      <View style={styles.buttonContainer}>
        <Button title="Add User" onPress={handleAddUser} disabled={isLoading} />
        <Button title="Refresh" onPress={fetchUsers} disabled={isLoading} color="#4CAF50" />
      </View>
      <FlatList
        data={users}
        keyExtractor={(item) => item.userId}
        renderItem={renderUser}
        ListEmptyComponent={<Text style={styles.emptyText}>No users found</Text>}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  userItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  userText: {
    fontSize: 16,
    color: '#333',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  loader: {
    marginVertical: 16,
  },
  error: {
    color: '#ff4444',
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginTop: 16,
  },
});

export default DataBaseScreen;
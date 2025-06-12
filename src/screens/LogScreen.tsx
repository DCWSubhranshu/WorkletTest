import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, FlatList, SafeAreaView } from 'react-native';
import { getVerificationLogs } from '../utils/database';

const LogScreen = () => {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const verificationLogs = await getVerificationLogs();
        setLogs(verificationLogs);
      } catch (error) {
        console.error('Error fetching logs:', error);
      }
    };
    fetchLogs();
  }, []);

  const renderLogItem = ({ item }) => (
    <View style={styles.logItem}>
      <Text style={styles.logText}>User: {item.userId}</Text>
      <Text style={styles.logText}>Time: {new Date(item.timestamp).toLocaleString()}</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>Verification Logs</Text>
      {logs.length === 0 ? (
        <Text style={styles.noLogsText}>No verification logs available</Text>
      ) : (
        <FlatList
          data={logs}
          renderItem={renderLogItem}
          keyExtractor={(item, index) => index.toString()}
          contentContainerStyle={styles.listContainer}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 20,
    color: '#333',
  },
  logItem: {
    backgroundColor: 'white',
    padding: 15,
    marginVertical: 5,
    marginHorizontal: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  logText: {
    fontSize: 16,
    color: '#333',
  },
  noLogsText: {
    fontSize: 18,
    textAlign: 'center',
    marginTop: 20,
    color: '#666',
  },
  listContainer: {
    paddingBottom: 20,
  },
});

export default LogScreen;

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Ionicons';

// Define the navigation stack param list
type RootStackParamList = {
  Home: undefined;
  Register: undefined;
  Verify: undefined;
  Database: undefined;
  Log: undefined;
};

// Define navigation prop type
type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();

  return (
    <LinearGradient colors={['#4c669f', '#3b5998', '#192f6a']} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <View style={styles.header}>
        <Text style={styles.headerText}>Welcome to the Ishuttle App</Text>
        <Text style={styles.subHeaderText}>Explore the Features</Text>
      </View>
      
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('Register')}
          activeOpacity={0.7}
        >
          <Icon name="person-add-outline" size={24} color="#fff" />
          <Text style={styles.buttonText}>Registration</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('Verify')}
          activeOpacity={0.7}
        >
          <Icon name="shield-checkmark-outline" size={24} color="#fff" />
          <Text style={styles.buttonText}>Verification</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('Database')}
          activeOpacity={0.7}
        >
          <Icon name="server-outline" size={24} color="#fff" />
          <Text style={styles.buttonText}>See Database</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.button}
          onPress={() => navigation.navigate('Log')}
          activeOpacity={0.7}
        >
          <Icon name="log-in-outline" size={24} color="#fff" />
          <Text style={styles.buttonText}>Logs</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: StatusBar.currentHeight,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  headerText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 4,
  },
  subHeaderText: {
    fontSize: 18,
    color: '#e0e0e0',
    marginTop: 8,
  },
  buttonContainer: {
    width: '80%',
    justifyContent: 'space-between',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 15,
    borderRadius: 12,
    marginVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  buttonText: {
    fontSize: 18,
    color: '#fff',
    marginLeft: 10,
    fontWeight: '600',
  },
});

export default HomeScreen;
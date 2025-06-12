import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  TextInput,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import DeviceInfo from 'react-native-device-info';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { API, COLORS } from '../utils/constants';
import RNRsa from 'react-native-rsa-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RootStackParamList } from '../../App';

const screenWidth = Dimensions.get('window').width;
type SplashScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Splash'>;

const SplashScreen = () => {
  const navigation = useNavigation<SplashScreenNavigationProp>();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const [deviceIdDisplay, setDeviceIdDisplay] = useState<string | null>(null);
  const [dotCount, setDotCount] = useState(0);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const busAnim = useRef(new Animated.Value(0)).current;
  const [busNumbers, setBusNumbers] = useState<{ value: string; label: string }[]>([]);
  const [filteredBusNumbers, setFilteredBusNumbers] = useState<{ value: string; label: string }[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [encodedDeviceId, setEncodedDeviceId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);



  // Function to show bus numbers
  const showBusNumbers = async () => {
    try {
      const params = encodeURIComponent('true');
      const url = `${API.BASE_URL}/api/transport/search-bus?is_initial=${params}`;
      console.log('Fetching bus numbers from:', url);
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          // add auth headers if needed
        },
      });
      const data = await response.json();
      console.log('Bus numbers:', data);
      setBusNumbers(data);
      setFilteredBusNumbers(data); // Initialize filtered list
    } catch (error) {
      console.error('Error showing bus numbers:', error);
        setErrorText('Failed to fetch bus numbers');
    }
  };

  // Function to register device with selected bus ID
  const registerDevice = async (busId: string) => {
    if (!encodedDeviceId) {
      console.error('Encoded device ID not available');
      setErrorText('Encoded device ID not available');
      return;
    }

    try {
       
      const response = await fetch(`${API.BASE_URL}/api/auth/register_device`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            bus_id: busId,
            encrypted_device_id: encodedDeviceId,
        }),
      });
      const data = await response.json();
      console.log('Register device response:', data);
      if (typeof data.detail === 'string') {
        if (data.detail.includes('Device registered successfully')) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          navigation.replace('Verify');
        }
      }
    } catch (error) {
      console.error('Error registering device:', error);
        setErrorText(`Failed to register device: ${error}`);
    }
  };

  // Fetch public key once
  useEffect(() => {
    const fetchPublicKey = async () => {
      try {
        const response = await fetch(`${API.BASE_URL}${API.PUBLIC_KEY}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        const json = await response.json();
        console.log('Fetched Public Key:', json.public_key);
        setPublicKey(json.public_key);
      } catch (error) {
        if (error instanceof Error) {
          console.error('Error fetching public key:', error.message);
        } else {
          console.error('Error fetching public key:', error);
        }
        setErrorText('Failed to fetch public key');
      }
    };
    fetchPublicKey();
  }, []);

  // Start animation + sending device ID
  useEffect(() => {
    const sendDeviceId = async () => {
      try {
        let deviceId = await DeviceInfo.getUniqueId();
        if (typeof deviceId !== 'string') {
          deviceId = String(deviceId);
        }

        if (!publicKey) {
          console.log('Public key not loaded yet...');
          return;
        }

        if (typeof publicKey !== 'string') {
          console.error('Public key is not a string:', publicKey);
          return;
        }

        const encryptedDeviceId = await RNRsa.encrypt(deviceId, publicKey);
        const encoded = encodeURIComponent(encryptedDeviceId);
        setEncodedDeviceId(encryptedDeviceId); // Store encoded device ID
        console.log('Encrypted Device ID:', encryptedDeviceId);
        console.log('Encoded Device ID:', encoded);
        const urrl = `${API.BASE_URL}/api/auth/check_device_registration?dv=${encoded}`;
        console.log('Sending device ID to serverhduiuauiasiusaiu:', urrl);

        const response = await fetch(
          `${API.BASE_URL}/api/auth/check_device_registration?dv=${encoded}`,
          {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          }
        );
        const data = await response.json();
        console.log('Response:', data);
        if (data.detail === 'REGISTERED' && data.bus_reg_number) {
          try {
            await AsyncStorage.setItem('busNumber', data.bus_reg_number);
            console.log('Bus number saved:', data.bus_reg_number);
        
            if (intervalRef.current) clearInterval(intervalRef.current);
            navigation.replace('Verify'); // now safe to go
          } catch (storageError) {
            console.error('Failed to store bus number:', storageError);
            setErrorText('Failed to save bus info. Try again.');
          }
        } else {
          console.log('Device not registered, showing device ID');
          setDeviceIdDisplay(deviceId);
          showBusNumbers();
        }
      } catch (error) {
        console.error('Failed to send encrypted device ID:', error);
        const deviceId = await DeviceInfo.getUniqueId();
        setDeviceIdDisplay(deviceId);
        showBusNumbers();
        setErrorText('Failed to send device ID');
      }
    };

    intervalRef.current = setInterval(sendDeviceId, 5000);
    sendDeviceId();

    const dotInterval = setInterval(() => {
      setDotCount(prev => (prev + 1) % 4);
    }, 500);

    Animated.loop(
      Animated.sequence([
        Animated.timing(busAnim, {
          toValue: screenWidth + 100,
          duration: 4000,
          useNativeDriver: true,
        }),
        Animated.timing(busAnim, {
          toValue: -100,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      clearInterval(dotInterval);
    };
  }, [publicKey, navigation, busAnim]);

  // Filter bus numbers based on search query
  useEffect(() => {
    const filtered = busNumbers.filter(bus =>
      bus.label.toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredBusNumbers(filtered);
  }, [searchQuery, busNumbers]);

  const dots = '.'.repeat(dotCount);

  // Render each bus number item
  const renderBusItem = ({ item }: { item: { value: string; label: string } }) => (
    <TouchableOpacity
      style={styles.busItem}
      onPress={() => registerDevice(item.value)}
    >
      <Text style={styles.busItemText}>{item.label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
<Text style={styles.error_text}>Welcome to iShuttle {errorText}</Text>
      <Text style={styles.text}>Initializing{dots}</Text>
      {deviceIdDisplay && (
        <>
          <Text style={styles.deviceIdText}>Device ID: {deviceIdDisplay}</Text>
          {busNumbers.length > 0 && (
            <View style={styles.busListContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search bus number..."
                placeholderTextColor={COLORS.TEXT_SECONDARY}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              <FlatList
                data={filteredBusNumbers}
                renderItem={renderBusItem}
                keyExtractor={item => item.value}
                style={styles.busList}
                ListEmptyComponent={
                  <Text style={styles.emptyText}>No buses found</Text>
                }
              />
            </View>
          )}
        </>
      )}

      {/* Road and Bus */}
      <View style={styles.roadContainer}>
        <View style={styles.road} />
        <Animated.Image
          source={require('../assets/images/bus.png')}
          style={[styles.busImage, { transform: [{ translateX: busAnim }] }]}
          resizeMode="contain"
        />
      </View>
    </View>
  );
};

export default SplashScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
    justifyContent: 'center',
    alignItems: 'center',
  },
  error_text: {
    fontSize: 10,
    marginBottom: 20,
    color: COLORS.ERROR,
    fontWeight: '600',
  },
  text: {
    fontSize: 20,
    marginBottom: 20,
    color: COLORS.PRIMARY,
    fontWeight: '600',
  },
  deviceIdText: {
    fontSize: 20,
    marginTop: 15,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
    paddingHorizontal: 24,
    fontWeight: '600',
  },
  roadContainer: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    height: 80,
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
  },
  road: {
    position: 'absolute',
    bottom: 0,
    height: 40,
    width: '100%',
    backgroundColor: '#333',
    borderTopColor: '#999',
    borderTopWidth: 4,
  },
  busImage: {
    width: 100,
    height: 50,
    marginLeft: -100,
    position: 'absolute',
    bottom: 20,
    marginRight: -100,
  },
  busListContainer: {
    width: '80%',
    marginTop: 20,
    maxHeight: 200,
  },
  searchInput: {
    height: 40,
    borderColor: COLORS.TEXT_SECONDARY,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    marginBottom: 10,
    color: COLORS.PRIMARY,
    backgroundColor: '#fff',
  },
  busList: {
    flexGrow: 0,
  },
  busItem: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.TEXT_SECONDARY,
    backgroundColor: '#fff',
    borderRadius: 5,
    marginVertical: 2,
  },
  busItemText: {
    fontSize: 16,
    color: COLORS.PRIMARY,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.TEXT_SECONDARY,
    textAlign: 'center',
    marginTop: 10,
  },
});
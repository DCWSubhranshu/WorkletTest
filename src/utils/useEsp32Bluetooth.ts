import { useEffect, useState } from 'react';
import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';
import RNBluetoothClassic from 'react-native-bluetooth-classic';

const ESP32_DEVICE_NAME = 'ESP32_Gate';
const PASSWORD = 'MySecurePass123'; // Must match ESP32 password

export const useBluetoothESP32 = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [device, setDevice] = useState(null);
  const [responses, setResponses] = useState([]);
  const [hasPermissions, setHasPermissions] = useState(false);

  const addResponse = (message: string) => {
    setResponses((prev) => [...prev, { id: Date.now().toString(), message }]);
  };

  const checkPermissions = async () => {
    const permissions = [
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    ];

    try {
      const results = await Promise.all(permissions.map(PermissionsAndroid.check));
      return results.every(Boolean);
    } catch (error) {
      Alert.alert('Permission Check Error', `Failed to check permissions: ${error.message}`);
      return false;
    }
  };

  const requestAndroidPermissions = async () => {
    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);

      const allGranted = Object.values(granted).every(
        (status) => status === PermissionsAndroid.RESULTS.GRANTED
      );

      if (!allGranted) {
        Alert.alert('Permissions Required', 'Bluetooth and location permissions are required.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open Settings', onPress: () => Linking.openSettings() },
        ]);
      }

      return allGranted;
    } catch (error) {
      Alert.alert('Permission Error', `Failed to request permissions: ${error.message}`);
      return false;
    }
  };

  const connectToESP32 = async () => {
    try {
      const enabled = await RNBluetoothClassic.isBluetoothEnabled();
      if (!enabled) {
        await RNBluetoothClassic.requestBluetoothEnabled();
      }

      let permissionsGranted = await checkPermissions();
      if (!permissionsGranted) {
        permissionsGranted = await requestAndroidPermissions();
      }

      if (!permissionsGranted) {
        setHasPermissions(false);
        return false;
      }

      setHasPermissions(true);

      const devices = await RNBluetoothClassic.getBondedDevices();
      const espDevice = devices.find((d) => d.name === ESP32_DEVICE_NAME);

      if (espDevice) {
        setDevice(espDevice);
        const connection = await espDevice.connect();
        if (connection) {
          setIsConnected(true);
          addResponse('Connected to ESP32_Gate');
          // Start listening for responses
          espDevice.onDataReceived((data) => {
            const message = data.data.trim();
            addResponse(`Received: ${message}`);
            if (message === 'AUTH_SUCCESS') {
              setIsAuthenticated(true);
              addResponse('Authentication successful');
            } else if (message === 'AUTH_FAILED') {
              setIsAuthenticated(false);
              addResponse('Authentication failed');
              Alert.alert('Authentication Error', 'Incorrect password');
            } else if (message === 'NOT_AUTHENTICATED') {
              addResponse('Command rejected: Not authenticated');
              Alert.alert('Error', 'Please authenticate first');
            }
          });
          // Send authentication command
          await espDevice.write(`AUTHENTICATE ${PASSWORD}\n`, 'utf8');
          addResponse('Sent: AUTHENTICATE');
          return true;
        }
      } else {
        Alert.alert('Device Not Found', 'ESP32_Gate not found in paired devices');
        return false;
      }
    } catch (error) {
      Alert.alert('Connection Error', `Bluetooth error: ${error.message}`);
      return false;
    }
  };

  const disconnectFromESP32 = async () => {
    try {
      if (device && isConnected) {
        await device.disconnect();
        setIsConnected(false);
        setIsAuthenticated(false);
        setDevice(null);
        addResponse('Disconnected from ESP32_Gate');
        return true;
      }
      return false;
    } catch (error) {
      addResponse(`Error disconnecting: ${error.message}`);
      return false;
    }
  };

  const toggleBluetoothConnection = async (shouldConnect: boolean) => {
    if (shouldConnect) {
      return await connectToESP32();
    } else {
      return await disconnectFromESP32();
    }
  };

  const sendCommand = async (command: string) => {
    if (!isConnected || !device) {
      Alert.alert('Error', 'Not connected to ESP32');
      console.warn('Not connected to ESP32');
      return;
    }

    if (!isAuthenticated && !command.startsWith('AUTHENTICATE')) {
      console.warn('Must authenticate before sending commands');
      Alert.alert('Error', 'Must authenticate before sending commands');
      return;
    }

    try {
      await device.write(`${command}\n`, 'utf8');
      addResponse(`Sent: ${command}`);
      console.log(`Sent: ${command}`);
    } catch (error) {
      //addResponse(`Error sending ${command}: ${error.message}`);
      console.error(`Error sending ${command}:`, error);
    }
  };

  const handleRetryPermissions = async () => {
    const granted = await requestAndroidPermissions();
    if (granted) {
      setHasPermissions(true);
      await connectToESP32();
    }
  };

  useEffect(() => {
    if (Platform.OS === 'android') {
      connectToESP32();
    } else {
      setHasPermissions(true);
      connectToESP32();
    }

    return () => {
      if (device) disconnectFromESP32();
    };
  }, []);

  return {
    isConnected,
    hasPermissions,
    isAuthenticated,
    responses,
    sendCommand,
    handleRetryPermissions,
    toggleBluetoothConnection, // Expose the new function
  };
};
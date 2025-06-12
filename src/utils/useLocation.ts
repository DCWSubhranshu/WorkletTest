import { useState, useEffect, useRef } from 'react';
import Geolocation from 'react-native-geolocation-service';
import { Platform, PermissionsAndroid, Alert, Linking } from 'react-native';
import DeviceInfo from 'react-native-device-info';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API } from './constants';

const LOCATION_INTERVAL_MS = 1000;

export const useLocation = () => {
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean | null>(null); // Initialize as null to indicate loading
  const [locationUpdated, setLocationUpdated] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [busNumber, setBusNumber] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const lastLocationRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const locationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;

    const fetchDeviceId = async () => {
      try {
        const id = await DeviceInfo.getUniqueId();
        if (isMounted.current) {
          setDeviceId(id);
        }
      } catch (error) {
        console.error('Failed to fetch device ID:', error);
      }
    };

    const fetchBusNumber = async () => {
      try {
        const bus = await AsyncStorage.getItem('busNumber');
        if (isMounted.current) {
          setBusNumber(bus);
        }
      } catch (error) {
        console.error('Failed to fetch bus number:', error);
      }
    };

    fetchDeviceId();
    fetchBusNumber();

    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    // Delay permission check to ensure Activity is attached
    const timer = setTimeout(() => {
      if (isMounted.current) {
        checkLocationPermission();
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (hasLocationPermission && deviceId) {
      sendLocationUpdate();
      locationIntervalRef.current = setInterval(sendLocationUpdate, LOCATION_INTERVAL_MS);
    }

    return () => {
      if (locationIntervalRef.current) {
        clearInterval(locationIntervalRef.current);
      }
    };
  }, [hasLocationPermission, deviceId]);

  const checkLocationPermission = async () => {
    try {
      if (Platform.OS === 'android') {
        const status = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        );
        if (status) {
          setHasLocationPermission(true);
          return;
        }
        requestLocationPermission();
      } else {
        const auth = await Geolocation.requestAuthorization('whenInUse');
        setHasLocationPermission(auth === 'granted');
        if (auth !== 'granted' && isMounted.current) {
          showPermissionAlert();
        }
      }
    } catch (error) {
      console.error('Error checking location permission:', error);
      setHasLocationPermission(false);
      if (isMounted.current) {
        showPermissionAlert();
      }
    }
  };

  const requestLocationPermission = async () => {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Location Permission',
            message: 'This app needs access to your location to function properly.',
            buttonPositive: 'OK',
            buttonNegative: 'Cancel',
          },
        );
        const isGranted = granted === PermissionsAndroid.RESULTS.GRANTED;
        setHasLocationPermission(isGranted);
        if (!isGranted && isMounted.current) {
          showPermissionAlert();
        }
      } else {
        const auth = await Geolocation.requestAuthorization('whenInUse');
        const isGranted = auth === 'granted';
        setHasLocationPermission(isGranted);
        if (!isGranted && isMounted.current) {
          showPermissionAlert();
        }
      }
    } catch (error) {
      console.error('Location permission error:', error);
      setHasLocationPermission(false);
      if (isMounted.current) {
        showPermissionAlert();
      }
    }
  };

  const showPermissionAlert = () => {
    Alert.alert(
      'Location Permission Required',
      'Please enable location access in settings.',
      [
        { text: 'Go to Settings', onPress: () => Linking.openSettings() },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const getLocation = async () => {
    if (!hasLocationPermission) {
      throw new Error('Location permission not granted');
    }
    return new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
      Geolocation.getCurrentPosition(
        ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
        error => reject(error),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 },
      );
    });
  };

  const getDistanceInMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const toRad = (x: number) => (x * Math.PI) / 180;
    const R = 6371e3; // Earth's radius in meters
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const checkSameLocation = (lat1: number, lon1: number, lat2: number, lon2: number): boolean => {
    return lat1 === lat2 && lon1 === lon2;
  };

  const sendLocationUpdate = async () => {
    if (!deviceId || processing || !hasLocationPermission) return;
    setLocationUpdated(false);
    setProcessing(true);
    try {
      const { latitude, longitude } = await getLocation();
      const lastLocation = lastLocationRef.current;
      if (lastLocation) {
        const distance = getDistanceInMeters(
          lastLocation.latitude,
          lastLocation.longitude,
          latitude,
          longitude,
        );
        if (
          checkSameLocation(lastLocation.latitude, lastLocation.longitude, latitude, longitude) ||
          distance < 0.5 // Ignore updates if movement is less than 0.5 meters
        ) {
          setProcessing(false);
          return;
        }
      }
      lastLocationRef.current = { latitude, longitude };

      const response = await fetch(`${API.BASE_URL}${API.LOCATION_UPDATE}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device_id: deviceId, latitude, longitude }),
      });
      
      const res = await response.json();
      console.log('Location update response:', res);
      if (isMounted.current) {
        setLocationUpdated(true);
      }
    } catch (error) {
      console.error('Failed to send location update:', error);
    } finally {
      if (isMounted.current) {
        setProcessing(false);
      }
    }
  };

  return {
    hasLocationPermission,
    locationUpdated,
    deviceId,
    busNumber,
    requestLocationPermission,
    getLocation,
    sendLocationUpdate,
  };
};
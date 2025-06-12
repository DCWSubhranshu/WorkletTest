import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Button,
  Platform,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  AppState,
} from 'react-native';
import { Camera, useCameraDevice, useFrameProcessor } from 'react-native-vision-camera';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import { request, PERMISSIONS } from 'react-native-permissions';
import { getUsers, initDB, logVerification } from '../utils/database';
import RNFS from 'react-native-fs';
import jpeg from 'jpeg-js';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import LinearGradient from 'react-native-linear-gradient';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useLocation } from '../utils/useLocation';
import { useBluetoothESP32 } from '../utils/useEsp32Bluetooth';
import { useKeepAwake } from '@sayem314/react-native-keep-awake';
import { runOnJS } from 'react-native-reanimated';


interface User {
  userId: string;
  embedding: number[];
}

interface VerificationResult {
  verified: boolean;
  userId?: string;
  distance?: number;
  message?: string;
}

interface FaceDetection {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
}

const VerifyScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  useKeepAwake();
  const device = useCameraDevice('front');
  const camera = useRef<Camera>(null);
  const { resize } = useResizePlugin();
  
  const faceNetModel = useTensorflowModel(require('../assets/mobilefacenet.tflite'));
  const faceDetectionModel = useTensorflowModel(require('../assets/face_detection_short_range.tflite'));
  
  const [status, setStatus] = useState<string>('Initializing...');
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [lastVerifiedUser, setLastVerifiedUser] = useState<string | null>(null);
  const [detections, setDetections] = useState<FaceDetection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [frameProcessorError, setFrameProcessorError] = useState<string | null>(null);
  const [cachedUsers, setCachedUsers] = useState<User[]>([]);
  const [isBluetoothTestMode, setIsBluetoothTestMode] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [lastCaptureTime, setLastCaptureTime] = useState<number>(0);
  const [performanceMetrics, setPerformanceMetrics] = useState<string[]>([]);

  const {
    hasLocationPermission,
    locationUpdated,
    busNumber,
    requestLocationPermission,
  } = useLocation();
  
  const {
    isConnected,
    hasPermissions,
    isAuthenticated,
    sendCommand,
    handleRetryPermissions,
    toggleBluetoothConnection,
  } = useBluetoothESP32();

  // Initialize app
  useEffect(() => {
    const initialize = async () => {
      try {
        if (Platform.OS === 'android') {
          const imagePermission = await request(
            Platform.Version >= 33
              ? PERMISSIONS.ANDROID.READ_MEDIA_IMAGES
              : PERMISSIONS.ANDROID.READ_EXTERNAL_STORAGE
          );
          if (imagePermission !== 'granted') {
            Alert.alert('Permission required', 'Cannot read image data without permission');
          }
        }

        const cameraPermission = await request(
          Platform.OS === 'ios' ? PERMISSIONS.IOS.CAMERA : PERMISSIONS.ANDROID.CAMERA
        );
        
        if (cameraPermission !== 'granted') {
          throw new Error('Camera permission denied');
        }

        await initDB();
        await fetchUsers();
        setStatus('Ready to scan');
      } catch (err) {
        setError(err.message);
        setStatus('Initialization failed');
        console.error('Initialization error:', err);
      }
    };

    initialize();

    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      setIsCameraActive(nextAppState === 'active');
    });

    return () => appStateSubscription.remove();
  }, []);

  // Model loading status
  useEffect(() => {
    console.log('Model states:', {
      faceNet: faceNetModel.state,
      faceDetection: faceDetectionModel.state
    });
  }, [faceNetModel.state, faceDetectionModel.state]);

  // Bluetooth status
  useEffect(() => {
    if (!isConnected && !isBluetoothTestMode) {
      setStatus('Connecting to ESP32...');
    } else if (!isAuthenticated && !isBluetoothTestMode) {
      setStatus('Authenticating with ESP32...');
    } else if (faceNetModel.state === 'loaded' && faceDetectionModel.state === 'loaded') {
      setStatus('Ready to scan');
    }
  }, [isConnected, isAuthenticated, isBluetoothTestMode, faceNetModel.state, faceDetectionModel.state]);

  const fetchUsers = async () => {
    try {
      const users = await getUsers();
      setCachedUsers(users);
      console.log(`Loaded ${users.length} users from database`);
    } catch (err) {
      setError('Failed to load users');
      console.error('Error fetching users:', err);
    }
  };

  const calculateEuclideanDistance = (emb1: number[], emb2: number[]): number => {
    if (emb1.length !== emb2.length) {
      throw new Error(`Embedding length mismatch: ${emb1.length} vs ${emb2.length}`);
    }
    return Math.sqrt(
      emb1.reduce((sum, val, i) => sum + Math.pow(val - emb2[i], 2), 0)
    );
  };

  const verifyFace = async (newEmbedding: number[]): Promise<VerificationResult> => {
    try {
      if (newEmbedding.length !== 128) {
        return { verified: false, message: `Invalid embedding length: ${newEmbedding.length}` };
      }

      if (cachedUsers.length === 0) {
        return { verified: false, message: 'No users registered' };
      }

      let closestMatch = { distance: Infinity, user: null as User | null };

      for (const user of cachedUsers) {
        const distance = calculateEuclideanDistance(newEmbedding, user.embedding);
        if (distance < closestMatch.distance) {
          closestMatch = { distance, user };
        }
      }

      const threshold = 0.6;
      if (closestMatch.distance < threshold && closestMatch.user) {
        await logVerification(closestMatch.user.userId);
        return {
          verified: true,
          userId: closestMatch.user.userId,
          distance: closestMatch.distance,
        };
      }
      
      return {
        verified: false,
        message: `No match found (closest: ${closestMatch.user?.userId} ${closestMatch.distance.toFixed(2)})`,
      };
    } catch (error) {
      console.error('Verification error:', error);
      return { verified: false, message: 'Error during verification' };
    }
  };

  const captureAndVerify = async () => {
    if (!camera.current || isScanning) return;
    
    setIsScanning(true);
    setStatus('Processing...');
    setError(null);
    setFrameProcessorError(null);

    try {
      const startTime = Date.now();
      
      // Capture photo
      const photo = await camera.current.takePhoto({
        qualityPrioritization: 'quality',
        flash: 'off',
        skipMetadata: true,
      });
      console.log('Photo captured:', photo.path);

      // Resize image
      const resizedImage = await ImageResizer.createResizedImage(
        `file://${photo.path}`,
        112,
        112,
        'JPEG',
        100
      );
      console.log('Image resized:', resizedImage.uri);

      // Read and decode image
      const base64Resized = await RNFS.readFile(resizedImage.uri, 'base64');
      const imageBuffer = base64ToUint8Array(base64Resized);
      const rawImageData = jpeg.decode(imageBuffer, { useTArray: true });

      // Normalize image data
      const normalized = new Float32Array(112 * 112 * 3);
      for (let i = 0; i < normalized.length; i++) {
        normalized[i] = rawImageData.data[i] / 255.0;
      }

      // Run face recognition
      const outputs = faceNetModel.model.runSync([normalized]);
      const embedding = Array.from(outputs[0]) as number[];
      console.log('Embedding generated:', embedding.length);

      // Verify face
      const result = await verifyFace(embedding);
      const processingTime = Date.now() - startTime;

      if (result.verified && result.userId) {
        setLastVerifiedUser(result.userId);
        setStatus(`Verified: ${result.userId} (${processingTime}ms)`);
        
        if (isConnected && isAuthenticated) {
          await sendCommand('FACE_DETECTED');
        }
      } else {
        setStatus(result.message || 'Verification failed');
      }

      // Update performance metrics
      setPerformanceMetrics(prev => [
        `Processed in ${processingTime}ms`,
        ...prev.slice(0, 4)
      ]);
    } catch (error) {
      console.error('Capture error:', error);
      setError(error.message);
      setStatus('Error during verification');
    } finally {
      setIsScanning(false);
    }
  };

  const frameProcessor = useFrameProcessor((frame) => {
    'worklet';
    try {
      // Early returns
      if (!faceDetectionModel.model || isScanning) return;
      if (faceDetectionModel.state !== 'loaded') {
        runOnJS(setStatus)('Face detection model loading...');
        return;
      }

      // Performance tracking
      const startTime = performance.now();

      // Resize frame
      const resized = resize(frame, {
        width: 128,
        height: 128,
        format: 'rgb',
        rotation: 0,
      });

      // Normalize
      const normalized = new Float32Array(128 * 128 * 3);
      for (let i = 0; i < resized.length; i++) {
        normalized[i] = (resized[i] - 128) / 128;
      }

      // Run detection
      const outputs = faceDetectionModel.model.runSync([normalized]);
      
      if (!outputs || outputs.length < 2) {
        throw new Error(`Invalid model output - expected 2 outputs, got ${outputs?.length}`);
      }

      const [boxes, scores] = outputs;
      const detections: FaceDetection[] = [];
      const threshold = 0.5;

      // Parse detections
      for (let i = 0; i < scores.length; i++) {
        if (scores[i] > threshold) {
          detections.push({
            x: boxes[i][1] * frame.width,
            y: boxes[i][0] * frame.height,
            width: (boxes[i][3] - boxes[i][1]) * frame.width,
            height: (boxes[i][2] - boxes[i][0]) * frame.height,
            score: scores[i],
          });
        }
      }

      // Update UI
      runOnJS(setDetections)(detections);
      runOnJS(setPerformanceMetrics)(prev => [
        `Frame processed in ${(performance.now() - startTime).toFixed(1)}ms`,
        ...prev.slice(0, 4)
      ]);

      // Auto-capture logic
      if (detections.length === 0) {
        runOnJS(setStatus)('No face detected');
        return;
      }

      const now = Date.now();
      if (now - lastCaptureTime < 3000) return;

      const frameCenterX = frame.width / 2;
      const frameCenterY = frame.height / 2;
      const minFaceSize = frame.width * 0.3;
      const maxFaceSize = frame.width * 0.7;
      const centerTolerance = frame.width * 0.2;

      const validFace = detections.find((det) => {
        const faceCenterX = det.x + det.width / 2;
        const faceCenterY = det.y + det.height / 2;
        const isCentered =
          Math.abs(faceCenterX - frameCenterX) < centerTolerance &&
          Math.abs(faceCenterY - frameCenterY) < centerTolerance;
        const isValidSize =
          det.width >= minFaceSize &&
          det.width <= maxFaceSize &&
          det.height >= minFaceSize &&
          det.height <= maxFaceSize;
        return isCentered && isValidSize && det.score > 0.7;
      });

      if (validFace) {
        runOnJS(setLastCaptureTime)(now);
        runOnJS(captureAndVerify)();
      }
    } catch (error) {
      runOnJS(setFrameProcessorError)(error.message);
      console.error('Frame processor error:', error.message);
    }
  }, [faceDetectionModel.model, isScanning, lastCaptureTime]);

  // Helper functions
  function base64ToUint8Array(base64: string): Uint8Array {
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  }

  const handleRetry = () => {
    setError(null);
    setFrameProcessorError(null);
    fetchUsers();
  };

  const handleBluetoothToggle = () => {
    toggleBluetoothConnection(!isConnected);
    setIsBluetoothTestMode(false);
  };

  const enableTestMode = () => {
    setIsBluetoothTestMode(true);
    setStatus('Test mode activated');
  };

  // Permission screens
  if (!hasLocationPermission) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>Location permission required</Text>
        <Button
          title="Grant Location Permission"
          onPress={requestLocationPermission}
          color="#00B7EB"
        />
      </View>
    );
  }

  if (!hasPermissions) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>Bluetooth permissions required</Text>
        <Button
          title="Retry Bluetooth Permissions"
          onPress={handleRetryPermissions}
          color="#00B7EB"
        />
      </View>
    );
  }

  if (isConnected && !isAuthenticated && !isBluetoothTestMode) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>ESP32 Authentication Required</Text>
        <Button
          title="Retry Authentication"
          onPress={() => sendCommand('AUTHENTICATE MySecurePass123')}
          color="#00B7EB"
        />
        <Button
          title="Enable Test Mode"
          onPress={enableTestMode}
          color="#FF4444"
        />
      </View>
    );
  }

  if (device == null || faceNetModel.state !== 'loaded' || faceDetectionModel.state !== 'loaded') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#00B7EB" />
        <Text style={styles.statusText}>
          {!device ? 'Loading camera...' : 'Loading models...'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        ref={camera}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isCameraActive}
        photo={true}
        pixelFormat="yuv"
        frameProcessor={frameProcessor}
        // fps={10}
      />

      <LinearGradient
        colors={['rgba(0,0,0,0.8)', 'transparent', 'transparent', 'rgba(0,0,0,0.8)']}
        style={styles.overlay}
      />

      {/* Status overlays */}
      <View style={styles.busNumberContainer}>
        <Text style={styles.busNumberText}>Bus: {busNumber || 'N/A'}</Text>
      </View>

      {locationUpdated && (
        <View style={styles.locationUpdatedContainer}>
          <MaterialIcons name="gps-fixed" size={20} color="#00FF9D" />
        </View>
      )}

      <View style={styles.bluetoothStatusContainer}>
        <MaterialIcons
          name={isConnected ? 'bluetooth-connected' : 'bluetooth'}
          size={20}
          color={isConnected && isAuthenticated ? '#00FF9D' : '#FF4444'}
        />
        <Text style={styles.bluetoothStatusText}>
          {isBluetoothTestMode ? 'Test Mode' : isConnected ? 'Connected' : 'Disconnected'}
        </Text>
      </View>

      {/* Face detection boxes */}
      {detections.map((det, index) => (
        <View
          key={index}
          style={[
            styles.faceBox,
            {
              left: det.x,
              top: det.y,
              width: det.width,
              height: det.height,
              borderColor: det.score > 0.7 ? '#00FF9D' : '#FF4444',
            },
          ]}
        />
      ))}

      {/* Debug information */}
      {__DEV__ && (
        <View style={styles.debugContainer}>
          {performanceMetrics.map((metric, i) => (
            <Text key={i} style={styles.debugText}>{metric}</Text>
          ))}
          {frameProcessorError && (
            <Text style={styles.debugError}>Error: {frameProcessorError}</Text>
          )}
        </View>
      )}

      {/* Controls */}
      <View style={styles.controlsContainer}>
        <View style={styles.statusContainer}>
          {isScanning && (
            <View style={styles.scanningIndicator}>
              <ActivityIndicator size="large" color="#00FF9D" />
              <Text style={styles.scanningText}>Verifying...</Text>
            </View>
          )}

          <Text style={styles.statusText}>{status}</Text>
          
          {(error || frameProcessorError) && (
            <View style={styles.errorContainer}>
              <MaterialIcons name="error" size={20} color="#FF4444" />
              <Text style={styles.errorText}>{error || frameProcessorError}</Text>
              <TouchableOpacity onPress={handleRetry} style={styles.retryButton}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}

          {lastVerifiedUser && (
            <View style={styles.verifiedBadge}>
              <MaterialIcons name="verified" size={16} color="#00FF9D" />
              <Text style={styles.verifiedText}>{lastVerifiedUser}</Text>
            </View>
          )}
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={captureAndVerify}
            disabled={isScanning}
          >
            <MaterialIcons
              name={isScanning ? 'face-retouching-natural' : 'camera'}
              size={24}
              color="white"
            />
            <Text style={styles.buttonText}>
              {isScanning ? 'Processing...' : 'Capture'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={() => navigation.navigate('Register')}
          >
            <MaterialIcons name="person-add" size={20} color="white" />
            <Text style={styles.buttonText}>Register</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomButtonRow}>
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={() => navigation.navigate('Log')}
          >
            <MaterialIcons name="history" size={20} color="white" />
            <Text style={styles.buttonText}>Logs</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={handleBluetoothToggle}
          >
            <MaterialIcons
              name={isConnected ? 'bluetooth' : 'bluetooth-disabled'}
              size={20}
              color="white"
            />
            <Text style={styles.buttonText}>
              {isConnected ? 'Disconnect' : 'Connect'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={() => navigation.navigate('Database')}
          >
            <MaterialIcons name="storage" size={20} color="white" />
            <Text style={styles.buttonText}>Database</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  faceBox: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 2,
    backgroundColor: 'rgba(0, 255, 157, 0.1)',
  },
  busNumberContainer: {
    position: 'absolute',
    top: 50,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 8,
    borderRadius: 8,
  },
  busNumberText: {
    color: 'white',
    fontWeight: 'bold',
  },
  locationUpdatedContainer: {
    position: 'absolute',
    top: 50,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 8,
    borderRadius: 8,
  },
  bluetoothStatusContainer: {
    position: 'absolute',
    top: 50,
    left: 60,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 8,
    borderRadius: 8,
  },
  bluetoothStatusText: {
    color: 'white',
    marginLeft: 4,
    fontWeight: 'bold',
  },
  debugContainer: {
    position: 'absolute',
    top: 100,
    left: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: 8,
    borderRadius: 8,
  },
  debugText: {
    color: 'white',
    fontSize: 12,
  },
  debugError: {
    color: '#FF4444',
    fontSize: 12,
    marginTop: 4,
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  statusContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  scanningIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  scanningText: {
    color: '#00FF9D',
    marginLeft: 8,
    fontWeight: 'bold',
  },
  statusText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
    textAlign: 'center',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 68, 68, 0.2)',
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  errorText: {
    color: '#FF4444',
    marginLeft: 4,
    flex: 1,
  },
  retryButton: {
    marginLeft: 8,
    paddingHorizontal: 8,
  },
  retryText: {
    color: 'white',
    fontWeight: 'bold',
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 255, 157, 0.2)',
    padding: 8,
    borderRadius: 8,
    marginTop: 8,
  },
  verifiedText: {
    color: '#00FF9D',
    marginLeft: 4,
    fontWeight: 'bold',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  bottomButtonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#0066FF',
    marginRight: 8,
  },
  secondaryButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  buttonText: {
    color: 'white',
    marginLeft: 8,
    fontWeight: 'bold',
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1E1E2E',
    padding: 20,
  },
  permissionText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
});

export default VerifyScreen;
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Alert, Platform, TextInput, Button, Image } from 'react-native';
import { Camera, useCameraDevice } from 'react-native-vision-camera';
import { useTensorflowModel } from 'react-native-fast-tflite';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import { request, PERMISSIONS } from 'react-native-permissions';
import { initDB, saveUser } from '../utils/database';
import RNFS from 'react-native-fs';
import jpeg from 'jpeg-js';
import ImageResizer from '@bam.tech/react-native-image-resizer';

const RegisterScreen = ({ navigation }) => {
  const device = useCameraDevice('front');
  const camera = useRef<Camera>(null);
  const { resize } = useResizePlugin();
  const tfliteModel = useTensorflowModel(require('../assets/mobilefacenet.tflite'));
  const [userId, setUserId] = useState('');
  const [status, setStatus] = useState('Ready to Register');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [embeddings, setEmbeddings] = useState<number[] | null>(null);

  useEffect(() => {
    const checkPermissions = async () => {
      const cameraPermission = await request(
        Platform.OS === 'ios' ? PERMISSIONS.IOS.CAMERA : PERMISSIONS.ANDROID.CAMERA
      );
      if (cameraPermission !== 'granted') {
        Alert.alert('Error', 'Camera permission denied');
      }
    };
    checkPermissions();
    initDB().catch((err) => {
      console.error('Failed to initialize database:', err);
      Alert.alert('Error', 'Failed to initialize database');
    });
  }, []);

  const takePhoto = async () => {
    try {
      if (camera.current) {
        const photo = await camera.current.takePhoto({
          qualityPrioritization: 'quality',
          flash: 'off',
          skipMetadata: true,
        });
        setCapturedPhoto(photo.path);
        setStatus('Photo captured. Ready to extract embeddings');
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to capture photo');
    }
  };

  function base64ToUint8Array(base64: string): Uint8Array {
    const binaryStr = atob(base64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  }

  async function extractEmbeddings() {
    if (!capturedPhoto || tfliteModel.state !== 'loaded') {
      Alert.alert('Error', 'No photo captured or model not loaded');
      return;
    }

    try {
      setStatus('Extracting embeddings...');
      const resizedImage = await ImageResizer.createResizedImage(
        `file://${capturedPhoto}`,
        112,
        112,
        'JPEG',
        100
      );
      const base64Resized = await RNFS.readFile(resizedImage.uri, 'base64');

      const imageBuffer = base64ToUint8Array(base64Resized);
      const rawImageData = jpeg.decode(imageBuffer, { useTArray: true });

      const normalized = new Float32Array(112 * 112 * 3);
      for (let i = 0; i < normalized.length; i++) {
        normalized[i] = rawImageData.data[i] / 255.0;
      }

      const outputs = tfliteModel.model.runSync([normalized]);
      const embedding = outputs[0];
      // Convert embedding to number[]
      const embeddingArray = Array.from(embedding) as number[];
      console.log('Extracted Embeddings:', embeddingArray);
      setEmbeddings(embeddingArray);
      setStatus('Embeddings extracted. Ready to register');
    } catch (error) {
      console.error('Error extracting embeddings:', error);
      Alert.alert('Error', 'Failed to extract embeddings');
      setStatus('Error extracting embeddings');
    }
  }

  const registerUser = async () => {
    const trimmedUserId = userId.trim();
    if (!trimmedUserId) {
      Alert.alert('Error', 'Please enter a valid User ID');
      return;
    }

    if (!embeddings) {
      Alert.alert('Error', 'No embeddings available');
      return;
    }

    try {
      setStatus('Registering user...');
      await saveUser(trimmedUserId, embeddings);
      Alert.alert('Success', `User ${trimmedUserId} registered successfully!`);
      setStatus('Registration Complete');
      setUserId('');
      setCapturedPhoto(null);
      setEmbeddings(null);
      setTimeout(() => navigation.navigate('Verify'), 2000);
    } catch (error) {
      console.error('Error saving user:', error);
      let errorMessage = 'Failed to register user';
      if (error.message.includes('UNIQUE constraint failed')) {
        errorMessage = 'User ID already exists. Please choose a different ID.';
      } else if (error.message.includes('Invalid user data')) {
        errorMessage = 'Invalid embedding data. Please try capturing the photo again.';
      }
      Alert.alert('Error', errorMessage);
      setStatus('Registration failed');
    }
  };

  if (device == null || tfliteModel.state !== 'loaded') {
    return <View style={styles.container}><Text>Loading camera or model...</Text></View>;
  }

  return (
    <View style={styles.container}>
      {capturedPhoto ? (
        <View style={styles.previewContainer}>
          <Image 
            source={{ uri: `file://${capturedPhoto}` }} 
            style={styles.previewImage}
            resizeMode="contain"
          />
        </View>
      ) : (
        <Camera
          ref={camera}
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={true}
          photo={true}
          pixelFormat="yuv"
        />
      )}
      
      <View style={styles.formContainer}>
        <TextInput
          style={[styles.input, !userId.trim() && userId.length > 0 ? styles.inputError : null]}
          placeholder="Enter User ID"
          value={userId}
          onChangeText={setUserId}
        />
        
        <View style={styles.buttonContainer}>
          {!capturedPhoto ? (
            <Button
              title="Capture Photo"
              onPress={takePhoto}
              disabled={!userId.trim()}
            />
          ) : (
            <>
              {!embeddings ? (
                <Button
                  title="Extract Embeddings"
                  onPress={extractEmbeddings}
                />
              ) : (
                <Button
                  title="Register User"
                  onPress={registerUser}
                />
              )}
              <Button
                title="Retake Photo"
                onPress={() => {
                  setCapturedPhoto(null);
                  setEmbeddings(null);
                  setStatus('Ready to Register');
                }}
                color="#ff4444"
              />
            </>
          )}
        </View>
        
        <Text style={styles.statusText}>{status}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  previewContainer: {
    flex: 1,
    backgroundColor: 'black',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  formContainer: {
    position: 'absolute',
    bottom: 50,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  input: {
    backgroundColor: 'white',
    width: '100%',
    padding: 10,
    marginBottom: 10,
    borderRadius: 5,
  },
  inputError: {
    borderColor: 'red',
    borderWidth: 1,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 10,
    gap: 10,
  },
  statusText: {
    color: 'white',
    fontSize: 18,
  },
});

export default RegisterScreen;
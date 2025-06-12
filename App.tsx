import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import RegisterScreen from './src/screens/RegistrationScreen';
import VerifyScreen from './src/screens/VarificationScreen';
import { enableScreens } from 'react-native-screens';
import HomeScreen from './src/screens/HomeScreen';
import DataBaseScreen from './src/screens/DataBaseScreen';
import LogScreen from './src/screens/LogScreen';
import SplashScreen from './src/screens/SpashScreen';
enableScreens();
export type RootStackParamList = {
  Log: undefined;
  Home: undefined;
  Verify: undefined;
  Register: undefined;
  Splash: undefined;
  Database: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const App = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Splash">
      <Stack.Screen name="Splash" component={SplashScreen}  options={{ headerShown: false }} />
        <Stack.Screen name="Home" component={HomeScreen}  />
        <Stack.Screen name="Register" component={RegisterScreen}  />
        <Stack.Screen name="Verify" component={VerifyScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Database" component={DataBaseScreen} />
        <Stack.Screen name="Log" component={LogScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};


export default App;
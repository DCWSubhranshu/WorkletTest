// API Endpoints
export const API = {
    //BASE_URL: 'http://192.168.2.75:8000',
    //BASE_URL: 'http://192.168.2.140:8000',
     //BASE_URL: 'http://192.168.151.133:8000',
     BASE_URL:'https://api.frs.intelisparkz.com',
     PUBLIC_KEY: '/api/auth/public_key',
     LOGIN: '/api/auth/login',
     REGISTER: '/api/auth/register-face/',
     GET_USER: '/user',
     VARIFY: '/api/auth/recognize-face/',
     VARIFIED: '/api/employee/boarding_in',
     LOCATIONEMP: '/api/auth/location-emp/',
     LOCATION_UPDATE: '/api/transport/update_bus_movement',
     REGISTER_EMP: '/api/register_employee',
 };
 
 // App Colors
 export const COLORS = {
     PRIMARY: '#482807',
     PRIMARY_DARK: '#2e1a05',
     PRIMARY_LIGHT: '#6b3e1d',
     SECONDARY: '#a65c2a',
     BACKGROUND: '#fffaf5',
     TEXT_PRIMARY: '#1e1e1e',
     TEXT_SECONDARY: '#4a4a4a',
     ERROR: '#ff4c4c',
     SUCCESS: '#4caf50',
     WARNING: '#ff9800',
     BORDER: '#dcdcdc',
   };
 
 // Other Constants
 export const CONSTANTS = {
     APP_NAME: 'VisionCameraApp',
     DEFAULT_LANGUAGE: 'en',
     TIMEOUT: 5000,
 };
 
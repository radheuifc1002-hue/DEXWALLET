import * as SecureStore from 'expo-secure-store';

export const storeSecureData = async (key, value) => {
    try {
        await SecureStore.setItemAsync(key, value);
    } catch (error) {
        console.error('Error storing secure data:', error);
    }
};

export const getSecureData = async (key) => {
    try {
        return await SecureStore.getItemAsync(key);
    } catch (error) {
        console.error('Error retrieving secure data:', error);
        return null;
    }
};

export const validatePin = (inputPin, storedPin) => {
    return inputPin === storedPin;
};
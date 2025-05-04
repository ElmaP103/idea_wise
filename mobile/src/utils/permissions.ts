import * as MediaLibrary from 'expo-media-library';
import * as ImagePicker from 'expo-image-picker';

export async function requestMediaPermissions() {
  await MediaLibrary.requestPermissionsAsync();
  await ImagePicker.requestCameraPermissionsAsync();
}

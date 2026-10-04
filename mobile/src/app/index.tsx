import { Redirect } from 'expo-router';
import { useApp } from '../lib/app-state';

export default function Index() {
  const { user } = useApp();
  return <Redirect href={user ? '/home' : '/login'} />;
}
